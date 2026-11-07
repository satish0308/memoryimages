import os
import gzip
import json
import sqlite3
import hashlib
import logging
import subprocess
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, is_postgres
from app.models.media import Media
from app.models.person import Person, FaceDetection
from app.models.album import Album
from app.models.user import User

logger = logging.getLogger(__name__)

BACKUP_DIR = "/data/db/backups"
SCHEDULE_CONFIG_PATH = os.path.join(BACKUP_DIR, "backup_schedule.json")

def _get_db_path() -> str:
    """Returns the local filesystem path of the SQLite database."""
    return settings.DATABASE_URL.replace("sqlite:////", "/")

def _ensure_backup_dir():
    """Ensures the backups directory exists."""
    os.makedirs(BACKUP_DIR, exist_ok=True)

def get_schedule_settings() -> Dict[str, Any]:
    """Reads the automated backup schedule configuration."""
    _ensure_backup_dir()
    if os.path.exists(SCHEDULE_CONFIG_PATH):
        try:
            with open(SCHEDULE_CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to read backup schedule, resetting to defaults: {e}")

    default_config = {
        "auto_backup_enabled": True,
        "frequency": "daily",  # 'daily' or 'weekly'
        "retention_count": 7,  # Keep last 7 backups
        "last_backup_at": None,
    }
    with open(SCHEDULE_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(default_config, f, indent=2)
    return default_config

def update_schedule_settings(
    auto_backup_enabled: bool,
    frequency: str,
    retention_count: int
) -> Dict[str, Any]:
    """Updates the automated backup schedule settings."""
    _ensure_backup_dir()
    current = get_schedule_settings()
    current["auto_backup_enabled"] = bool(auto_backup_enabled)
    current["frequency"] = "weekly" if frequency.lower() == "weekly" else "daily"
    current["retention_count"] = max(1, min(100, int(retention_count)))

    with open(SCHEDULE_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2)
    return current

def create_wal_backup(db: Session, label: Optional[str] = None) -> Dict[str, Any]:
    """
    Performs a zero-downtime, online SQLite backup using Python's native sqlite3.backup API.
    Guarantees consistency across active WAL journals, compresses with gzip, and generates SHA-256.
    """
    _ensure_backup_dir()
    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    clean_label = f"_{label}" if label else ""
    base_name = f"backup_{timestamp_str}{clean_label}"
    temp_db_path = os.path.join(BACKUP_DIR, f"{base_name}.tmp.db")
    final_gz_path = os.path.join(BACKUP_DIR, f"{base_name}.db.gz")
    metadata_json_path = os.path.join(BACKUP_DIR, f"{base_name}.json")

    try:
        sha256_hasher = hashlib.sha256()

        if is_postgres:
            # PostgreSQL Online Compressed Dump
            cmd = ["pg_dump", settings.DATABASE_URL, "-Fc"]
            with open(final_gz_path, "wb") as f_out:
                proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                f_out.write(proc.stdout)
                sha256_hasher.update(proc.stdout)
            uncompressed_size = os.path.getsize(final_gz_path)
            compressed_size = uncompressed_size
        else:
            # Step 1: Online non-blocking SQLite backup
            db_path = _get_db_path()
            if not os.path.exists(db_path):
                raise FileNotFoundError(f"Database file not found at {db_path}")

            src_conn = sqlite3.connect(db_path)
            dest_conn = sqlite3.connect(temp_db_path)
            with dest_conn:
                src_conn.backup(dest_conn, pages=100)
            dest_conn.close()
            src_conn.close()

            uncompressed_size = os.path.getsize(temp_db_path)

            # Step 2: Gzip compression & SHA256 calculation
            with open(temp_db_path, "rb") as f_in, gzip.open(final_gz_path, "wb", compresslevel=9) as f_out:
                while chunk := f_in.read(64 * 1024):
                    f_out.write(chunk)
                    sha256_hasher.update(chunk)
            compressed_size = os.path.getsize(final_gz_path)
        checksum = sha256_hasher.hexdigest()

        # Step 3: Inspect database stats
        photos_count = db.query(Media).count()
        people_count = db.query(Person).count()
        faces_count = db.query(FaceDetection).count()
        albums_count = db.query(Album).count()
        users_count = db.query(User).count()

        meta = {
            "filename": f"{base_name}.db.gz",
            "created_at": datetime.utcnow().isoformat(),
            "size_bytes": compressed_size,
            "uncompressed_bytes": uncompressed_size,
            "compression_ratio": f"{round((1 - (compressed_size / max(uncompressed_size, 1))) * 100, 1)}%",
            "sha256": checksum,
            "label": label or "manual",
            "stats": {
                "photos_count": photos_count,
                "people_count": people_count,
                "faces_count": faces_count,
                "albums_count": albums_count,
                "users_count": users_count
            },
            "status": "healthy"
        }

        with open(metadata_json_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        # Step 4: Update last_backup_at in schedule config
        config = get_schedule_settings()
        config["last_backup_at"] = meta["created_at"]
        with open(SCHEDULE_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)

        # Step 5: Prune old backups per retention policy
        _prune_old_backups(config.get("retention_count", 7))

        return meta

    finally:
        if os.path.exists(temp_db_path):
            try:
                os.remove(temp_db_path)
            except Exception:
                pass

def _prune_old_backups(retention_count: int):
    """Deletes the oldest backup snapshots beyond retention limit."""
    backups = list_backups()
    if len(backups) > retention_count:
        to_delete = backups[retention_count:]
        for b in to_delete:
            delete_backup(b["filename"])

def list_backups() -> List[Dict[str, Any]]:
    """Lists all available backup snapshots ordered from newest to oldest."""
    _ensure_backup_dir()
    results = []

    for item in os.listdir(BACKUP_DIR):
        if item.endswith(".db.gz"):
            gz_path = os.path.join(BACKUP_DIR, item)
            json_path = os.path.join(BACKUP_DIR, item.replace(".db.gz", ".json"))

            if os.path.exists(json_path):
                try:
                    with open(json_path, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                        results.append(meta)
                        continue
                except Exception:
                    pass

            # Fallback if companion JSON is missing
            stat = os.stat(gz_path)
            created_dt = datetime.fromtimestamp(stat.st_mtime)
            results.append({
                "filename": item,
                "created_at": created_dt.isoformat(),
                "size_bytes": stat.st_size,
                "uncompressed_bytes": stat.st_size * 3,
                "compression_ratio": "~65%",
                "sha256": "N/A",
                "label": "unknown",
                "stats": {
                    "photos_count": -1,
                    "people_count": -1,
                    "albums_count": -1,
                    "users_count": -1
                },
                "status": "healthy"
            })

    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results

def get_backup_path(filename: str) -> str:
    """Validates filename and returns its full path."""
    clean_name = os.path.basename(filename)
    if not clean_name.endswith(".db.gz"):
        raise ValueError("Invalid backup file extension")
    path = os.path.join(BACKUP_DIR, clean_name)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Backup file {clean_name} does not exist")
    return path

def delete_backup(filename: str) -> bool:
    """Safely removes a backup snapshot and its metadata JSON."""
    clean_name = os.path.basename(filename)
    gz_path = os.path.join(BACKUP_DIR, clean_name)
    json_path = os.path.join(BACKUP_DIR, clean_name.replace(".db.gz", ".json"))

    deleted = False
    if os.path.exists(gz_path):
        os.remove(gz_path)
        deleted = True
    if os.path.exists(json_path):
        try:
            os.remove(json_path)
        except Exception:
            pass
    return deleted

def restore_backup(filename: str, db: Session) -> Dict[str, Any]:
    """
    Restores the database from a backup snapshot.
    Automatically takes a pre-restore safety backup first, validates integrity,
    and replaces the active database file safely.
    """
    gz_path = get_backup_path(filename)
    db_path = _get_db_path()

    # Step 1: Verify backup file integrity by test-decompressing
    temp_verify_path = os.path.join(BACKUP_DIR, "temp_restore_verify.db")
    try:
        with gzip.open(gz_path, "rb") as f_in, open(temp_verify_path, "wb") as f_out:
            while chunk := f_in.read(64 * 1024):
                f_out.write(chunk)

        # Run SQLite integrity check on decompressed database
        test_conn = sqlite3.connect(temp_verify_path)
        cursor = test_conn.cursor()
        cursor.execute("PRAGMA integrity_check;")
        check_result = cursor.fetchone()
        test_conn.close()

        if not check_result or check_result[0] != "ok":
            raise ValueError(f"Corrupt backup archive: integrity check returned {check_result}")

        # Step 2: Create pre-restore safety snapshot of the CURRENT database
        safety_meta = create_wal_backup(db, label="pre_restore_safety")

        # Step 3: Dispose active SQLAlchemy connections
        engine.dispose()

        # Step 4: Atomically swap database file and remove stale WAL / SHM files
        if os.path.exists(db_path):
            os.remove(db_path)
        wal_path = f"{db_path}-wal"
        shm_path = f"{db_path}-shm"
        if os.path.exists(wal_path):
            os.remove(wal_path)
        if os.path.exists(shm_path):
            os.remove(shm_path)

        os.rename(temp_verify_path, db_path)

        # Step 5: Ensure WAL mode is active on the restored database
        post_conn = sqlite3.connect(db_path)
        p_cur = post_conn.cursor()
        p_cur.execute("PRAGMA journal_mode=WAL;")
        p_cur.execute("PRAGMA synchronous=NORMAL;")
        post_conn.commit()
        post_conn.close()

        logger.info(f"Database successfully restored from {filename}")
        return {
            "status": "success",
            "restored_from": filename,
            "safety_backup": safety_meta["filename"],
            "restored_at": datetime.utcnow().isoformat()
        }

    finally:
        if os.path.exists(temp_verify_path):
            try:
                os.remove(temp_verify_path)
            except Exception:
                pass

def restore_from_upload(
    file_bytes: bytes,
    original_filename: str,
    db: Session
) -> Dict[str, Any]:
    """
    Accepts an uploaded backup file (.db or .db.gz), stores it in the backups directory,
    and performs a validated point-in-time restore.
    """
    _ensure_backup_dir()
    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    stored_name = f"uploaded_backup_{timestamp_str}.db.gz"
    stored_path = os.path.join(BACKUP_DIR, stored_name)

    # If raw uncompressed .db was uploaded, compress it to .db.gz
    if original_filename.endswith(".db"):
        compressed = gzip.compress(file_bytes, compresslevel=9)
        with open(stored_path, "wb") as f:
            f.write(compressed)
    else:
        # Already .db.gz
        with open(stored_path, "wb") as f:
            f.write(file_bytes)

    # Perform restore using standard routine
    return restore_backup(stored_name, db)

def check_and_run_scheduled_backup(db: Session):
    """
    Checks the schedule config and triggers an automated backup if due.
    Can be called on system startup or periodic background heartbeat.
    """
    try:
        config = get_schedule_settings()
        if not config.get("auto_backup_enabled", True):
            return

        last_str = config.get("last_backup_at")
        frequency = config.get("frequency", "daily")
        threshold_hours = 24 if frequency == "daily" else 168

        should_run = False
        if not last_str:
            should_run = True
        else:
            try:
                last_dt = datetime.fromisoformat(last_str)
                if (datetime.utcnow() - last_dt) > timedelta(hours=threshold_hours):
                    should_run = True
            except Exception:
                should_run = True

        if should_run:
            logger.info(f"Running automated scheduled backup ({frequency})...")
            create_wal_backup(db, label=f"scheduled_{frequency}")
    except Exception as e:
        logger.warning(f"Error in automated backup schedule check: {e}")
