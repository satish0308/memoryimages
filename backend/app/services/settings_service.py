import os
import json
import shutil
import logging
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.setting import AppSetting
from app.config import settings

logger = logging.getLogger(__name__)

LOCAL_SETTINGS_PATH = "/data/db/app_settings.json"

# Default system settings
DEFAULT_SETTINGS = {
    "storage_mode": {
        "value": "in_memory",
        "description": "Storage strategy: 'in_memory' (RAM buffer + Google Drive CDN) or 'local_disk' (volume mount caching)."
    },
    "local_storage_approved": {
        "value": "false",
        "description": "Explicit user approval required to create directories or store files on local disk/volume mount."
    },
    "use_google_cdn_thumbnails": {
        "value": "true",
        "description": "Serve thumbnails directly via Google Drive CDN (9drive architecture) without local disk writes."
    },
    "max_memory_cache_mb": {
        "value": "512",
        "description": "Maximum RAM allocation in megabytes for in-memory stream buffers."
    },
    "allowed_local_dirs": {
        "value": "[]",
        "description": "JSON array of explicitly approved local directory paths."
    },
    # AI & Face Recognition
    "face_similarity_threshold": {
        "value": "0.48",
        "description": "Cosine similarity threshold (0.20 - 0.80) for face recognition and clustering. Higher = stricter match."
    },
    "face_recognition_global": {
        "value": "true",
        "description": "Share recognized named people globally across user accounts with zero duplicate tagging, while photos remain 100% private."
    },
    "face_detection_confidence": {
        "value": "0.30",
        "description": "Minimum confidence threshold (0.10 - 0.90) for detecting human face bounding boxes in photos."
    },
    # Semantic Vector Search
    "semantic_search_min_similarity": {
        "value": "0.16",
        "description": "Minimum cosine similarity score (0.05 - 0.50) to return a photo or video keyframe in CLIP natural language search."
    },
    # Smart Triage & Quality
    "blur_laplacian_threshold": {
        "value": "65.0",
        "description": "Laplacian focus variance threshold (20.0 - 150.0). Photos with focus score below this are categorized as out-of-focus."
    },
    "duplicate_distance_threshold": {
        "value": "6",
        "description": "Perceptual hash Hamming distance (1 - 15) for grouping duplicate and burst shots in Smart Triage."
    },
    "screenshot_expiry_days": {
        "value": "30",
        "description": "Number of days (1 - 365) before temporary screenshots and document clips are surfaced for triage review."
    }
}

# In-memory fast cache
_SETTINGS_CACHE: Dict[str, str] = {}

def _load_local_settings() -> Dict[str, str]:
    """Reads settings from persistent local JSON file."""
    if os.path.exists(LOCAL_SETTINGS_PATH):
        try:
            with open(LOCAL_SETTINGS_PATH, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to read local settings from {LOCAL_SETTINGS_PATH}: {e}")
    return {}

def _save_local_settings(settings_dict: Dict[str, str]):
    """Persists settings to /data/db/app_settings.json."""
    try:
        os.makedirs(os.path.dirname(LOCAL_SETTINGS_PATH), exist_ok=True)
        existing = _load_local_settings()
        existing.update(settings_dict)
        with open(LOCAL_SETTINGS_PATH, "w") as f:
            json.dump(existing, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to save local settings to {LOCAL_SETTINGS_PATH}: {e}")

def sync_local_settings_to_db(db: Session):
    """
    Ensures all locally stored settings from /data/db/app_settings.json
    are reflected in the active database.
    Also exports current database settings to /data/db/app_settings.json if missing.
    """
    local = _load_local_settings()
    if not local:
        current_in_db = {}
        try:
            rows = db.query(AppSetting).all()
            for r in rows:
                current_in_db[r.key] = r.value
            if current_in_db:
                _save_local_settings(current_in_db)
        except Exception as e:
            logger.warning(f"Could not export DB settings to local file: {e}")
        return

    try:
        for k, v in local.items():
            s = db.query(AppSetting).filter(AppSetting.key == k).first()
            if not s:
                desc = DEFAULT_SETTINGS.get(k, {}).get("description")
                db.add(AppSetting(key=k, value=str(v), description=desc))
            else:
                s.value = str(v)
            _SETTINGS_CACHE[k] = str(v)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"Error syncing local settings to DB: {e}")

def get_setting(db: Session, key: str, default: Optional[str] = None) -> str:
    """Retrieves a configuration value from DB, local file, or cache, falling back to defaults."""
    if key in _SETTINGS_CACHE:
        return _SETTINGS_CACHE[key]

    try:
        setting = db.query(AppSetting).filter(AppSetting.key == key).first()
        if setting:
            _SETTINGS_CACHE[key] = setting.value
            return setting.value
    except Exception as e:
        logger.warning(f"Could not query AppSetting from database: {e}")

    # Fallback to persistent local file on disk (/data/db/app_settings.json)
    local_settings = _load_local_settings()
    if key in local_settings:
        val = local_settings[key]
        _SETTINGS_CACHE[key] = val
        try:
            desc = DEFAULT_SETTINGS.get(key, {}).get("description")
            new_s = AppSetting(key=key, value=str(val), description=desc)
            db.add(new_s)
            db.commit()
        except Exception:
            db.rollback()
        return val

    # Fallback to default
    if key in DEFAULT_SETTINGS:
        def_val = DEFAULT_SETTINGS[key]["value"]
        _SETTINGS_CACHE[key] = def_val
        return def_val

    return default or ""

def set_setting(db: Session, key: str, value: str, description: Optional[str] = None) -> AppSetting:
    """Persists a configuration value to the database, local file, and updates cache."""
    setting = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not setting:
        desc = description or DEFAULT_SETTINGS.get(key, {}).get("description")
        setting = AppSetting(key=key, value=str(value), description=desc)
        db.add(setting)
    else:
        setting.value = str(value)
        if description:
            setting.description = description

    db.commit()
    db.refresh(setting)
    _SETTINGS_CACHE[key] = setting.value
    
    # Mirror to local disk file so settings survive all restarts and engine switches
    _save_local_settings({key: str(value)})
    return setting

def is_local_storage_approved(db: Session) -> bool:
    """Returns whether the user has explicitly authorized local disk/volume mount storage."""
    val = get_setting(db, "local_storage_approved", "false").strip().lower()
    return val in ("true", "1", "yes")

def get_storage_mode(db: Session) -> str:
    """
    Returns the active storage mode: 'in_memory' or 'local_disk'.
    If local storage is not approved, always enforces 'in_memory' to prevent unauthorized disk writes.
    """
    if not is_local_storage_approved(db):
        return "in_memory"
    return get_setting(db, "storage_mode", "in_memory").strip().lower()

def get_all_settings(db: Session) -> Dict[str, Any]:
    """Returns all settings consolidated with defaults and live system metrics."""
    result = {}
    for key, info in DEFAULT_SETTINGS.items():
        result[key] = get_setting(db, key, info["value"])

    # Cast boolean & numerical types for frontend convenience
    return {
        "storage_mode": result["storage_mode"],
        "local_storage_approved": result["local_storage_approved"].lower() in ("true", "1", "yes"),
        "use_google_cdn_thumbnails": result["use_google_cdn_thumbnails"].lower() in ("true", "1", "yes"),
        "max_memory_cache_mb": int(result["max_memory_cache_mb"]) if result["max_memory_cache_mb"].isdigit() else 512,
        "allowed_local_dirs": json.loads(result["allowed_local_dirs"]) if result["allowed_local_dirs"].startswith("[") else [],

        # AI & Recognition settings
        "face_similarity_threshold": float(result.get("face_similarity_threshold", "0.48")),
        "face_recognition_global": result.get("face_recognition_global", "true").lower() in ("true", "1", "yes"),
        "face_detection_confidence": float(result.get("face_detection_confidence", "0.30")),
        "semantic_search_min_similarity": float(result.get("semantic_search_min_similarity", "0.16")),
        "blur_laplacian_threshold": float(result.get("blur_laplacian_threshold", "65.0")),
        "duplicate_distance_threshold": int(result.get("duplicate_distance_threshold", "6")),
        "screenshot_expiry_days": int(result.get("screenshot_expiry_days", "30")),

        "metrics": get_storage_metrics(db)
    }

import time

_DIR_SIZE_CACHE: Dict[str, Any] = {}

def _get_dir_size_mb(path: str, ttl_seconds: float = 300.0) -> float:
    """Helper to compute directory size in megabytes safely with 5-minute TTL cache."""
    if not os.path.isdir(path):
        return 0.0
    now = time.time()
    if path in _DIR_SIZE_CACHE:
        val, ts = _DIR_SIZE_CACHE[path]
        if (now - ts) < ttl_seconds:
            return val

    total_bytes = 0
    try:
        for root, _, files in os.walk(path):
            for f in files:
                fp = os.path.join(root, f)
                if not os.path.islink(fp):
                    total_bytes += os.path.getsize(fp)
    except Exception:
        pass
    res = round(total_bytes / (1024.0 * 1024.0), 2)
    _DIR_SIZE_CACHE[path] = (res, now)
    return res

def get_storage_metrics(db: Session) -> Dict[str, Any]:
    """Calculates live storage consumption metrics across RAM and local volumes."""
    from app.services.drive_cache import get_memory_cache_stats
    from app.models.media import Media
    from sqlalchemy import func

    # Ultra-fast DB aggregation (1ms) instead of 90s recursive disk walk across 190GB
    total_bytes = db.query(func.sum(Media.file_size)).filter(Media.is_deleted == False).scalar() or 0
    orig_mb = round(float(total_bytes) / (1024.0 * 1024.0), 2)
    thumb_mb = _get_dir_size_mb(settings.THUMBNAIL_DIR, ttl_seconds=600.0)
    total_disk_mb = round(orig_mb + thumb_mb, 2)

    mem_stats = get_memory_cache_stats()

    return {
        "active_storage_mode": get_storage_mode(db),
        "local_storage_approved": is_local_storage_approved(db),
        "memory_cache_entries": mem_stats["cached_entries"],
        "memory_cache_mb": mem_stats["estimated_cache_mb"],
        "local_originals_mb": orig_mb,
        "local_thumbnails_mb": thumb_mb,
        "total_local_disk_mb": total_disk_mb,
        "is_volume_mounted": os.path.exists("/data")
    }

def clear_cache(db: Session, clear_local_disk: bool = False) -> Dict[str, Any]:
    """
    Safely flushes in-memory cache and/or generated local WebP thumbnails.
    Note: Under zero auto-deletion policy, original photos are NEVER deleted.
    """
    from app.services.drive_cache import clear_memory_cache
    
    # 1. Clear in-memory cache
    memory_cleared = clear_memory_cache()

    # 2. Clear thumbnail cache on disk only if explicitly requested
    thumbnails_cleared = 0
    if clear_local_disk:
        thumb_dir = settings.THUMBNAIL_DIR
        if os.path.isdir(thumb_dir):
            for root, _, files in os.walk(thumb_dir):
                for f in files:
                    try:
                        os.remove(os.path.join(root, f))
                        thumbnails_cleared += 1
                    except Exception:
                        pass

    return {
        "status": "success",
        "memory_cache_entries_cleared": memory_cleared,
        "local_thumbnails_cleared": thumbnails_cleared,
        "metrics": get_storage_metrics(db)
    }
