import time
import logging
import numpy as np
from typing import Dict, Any, Optional
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import (
    Base, 
    get_db_dialect, 
    is_postgres, 
    is_sqlite, 
    check_pgvector_active, 
    check_postgres_availability,
    normalize_db_url
)
from app.models.user import User
from app.models.media import Media, MediaEmbedding, VideoKeyframe
from app.models.person import Person, FaceDetection
from app.models.album import Album, album_media
from app.models.sync import SyncSource
from app.models.setting import AppSetting

logger = logging.getLogger(__name__)

def get_database_status() -> Dict[str, Any]:
    """
    Returns comprehensive telemetry about the current active database (SQLite or PostgreSQL),
    table counts, pgvector availability, and HNSW vector index status.
    """
    from app.database import engine, SessionLocal, get_db_dialect, check_pgvector_active
    dialect = get_db_dialect()
    curr_is_postgres = (dialect == "postgresql")
    curr_is_sqlite = (dialect == "sqlite")
    
    table_counts = {}
    db = SessionLocal()
    try:
        table_counts = {
            "media": db.query(Media).count(),
            "embeddings": db.query(MediaEmbedding).count(),
            "people": db.query(Person).count(),
            "faces": db.query(FaceDetection).count(),
            "albums": db.query(Album).count(),
            "users": db.query(User).count(),
            "pending_disk_deletions": db.query(Media).filter(Media.pending_disk_deletion == True).count(),
        }
    except Exception as e:
        logger.warning(f"Could not read table counts: {e}")
    finally:
        db.close()

    # Check HNSW index status if in postgres
    hnsw_index_exists = False
    if curr_is_postgres:
        try:
            with engine.connect() as conn:
                res = conn.execute(text("""
                    SELECT indexname FROM pg_indexes 
                    WHERE tablename = 'media_embeddings' AND indexname = 'idx_media_embeddings_hnsw';
                """)).fetchone()
                hnsw_index_exists = res is not None
        except Exception:
            hnsw_index_exists = False

    # Check postgres container availability
    pg_status = check_postgres_availability()

    # Mask database URL
    url_str = settings.DATABASE_URL
    if "@" in url_str:
        protocol = url_str.split("://")[0]
        host_part = url_str.split("@")[-1]
        masked_url = f"{protocol}://***:***@{host_part}"
    else:
        masked_url = url_str

    return {
        "active_dialect": dialect,
        "active_database_url": masked_url,
        "is_sqlite": curr_is_sqlite,
        "is_postgres": curr_is_postgres,
        "table_counts": table_counts,
        "pgvector_active": check_pgvector_active() if curr_is_postgres else False,
        "hnsw_index_active": hnsw_index_exists,
        "postgres_target_available": pg_status.get("available", False),
        "postgres_details": pg_status,
        "supported_engines": ["sqlite", "postgresql"],
        "vector_dimension": 512,
        "vector_metric": "cosine"
    }

def ensure_pgvector_hnsw_index(pg_engine=None) -> Dict[str, Any]:
    """
    Creates the vector extension and HNSW cosine index on media_embeddings table.
    """
    from app.database import engine
    target_engine = pg_engine or engine
    
    results = {"extension_created": False, "hnsw_created": False, "error": None}
    try:
        with target_engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            conn.commit()
            results["extension_created"] = True

            # Create HNSW index for sub-10ms vector similarity
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_media_embeddings_hnsw 
                ON media_embeddings USING hnsw (embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64);
            """))
            try:
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_video_keyframes_hnsw 
                    ON video_keyframes USING hnsw (embedding vector_cosine_ops)
                    WITH (m = 16, ef_construction = 64);
                """))
            except Exception:
                pass
            conn.commit()
            results["hnsw_created"] = True
            logger.info("Created / verified HNSW cosine vector index on PostgreSQL.")
    except Exception as e:
        results["error"] = str(e)
        logger.error(f"Error creating HNSW index: {e}")

    return results

def clone_record(instance, target_cls=None):
    """Clones a SQLAlchemy model instance using column reflection."""
    cls = target_cls or instance.__class__
    col_names = [c.name for c in inspect(cls).columns]
    data = {}
    for col in col_names:
        if hasattr(instance, col):
            val = getattr(instance, col)
            if isinstance(val, str) and "\x00" in val:
                val = val.replace("\x00", "")
            data[col] = val
    return cls(**data)

def migrate_database(source_url: Optional[str] = None, target_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Migrates all data seamlessly between SQLite and PostgreSQL (or any two SQLAlchemy databases).
    Handles vector conversions (raw byte buffers <-> 512-dim pgvector arrays).
    """
    start_time = time.time()
    
    # Default: migrate from current active DATABASE_URL to POSTGRES_URL
    src_url = normalize_db_url(source_url or settings.DATABASE_URL)
    tgt_url = normalize_db_url(target_url or settings.POSTGRES_URL)

    if src_url == tgt_url:
        return {"success": False, "error": "Source and target database URLs cannot be identical."}

    logger.info(f"Starting database migration from {src_url} to {tgt_url}")

    src_engine = create_engine(src_url, pool_pre_ping=True, connect_args={"check_same_thread": False} if src_url.startswith("sqlite") else {})
    tgt_is_postgres = tgt_url.startswith("postgresql")
    tgt_engine = create_engine(tgt_url, pool_pre_ping=True)

    # If target is PostgreSQL, ensure vector extension exists before creating tables
    if tgt_is_postgres:
        try:
            with tgt_engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                conn.commit()
        except Exception as e:
            logger.warning(f"Could not init vector extension on target: {e}")

    # Create target tables
    Base.metadata.create_all(bind=tgt_engine)
    try:
        from app.main import check_and_upgrade_schema
        check_and_upgrade_schema(src_engine)
        check_and_upgrade_schema(tgt_engine)
    except Exception as e:
        logger.warning(f"Schema upgrade check notice: {e}")

    SrcSession = sessionmaker(bind=src_engine)
    TgtSession = sessionmaker(bind=tgt_engine)

    src_db = SrcSession()
    tgt_db = TgtSession()

    stats = {
        "users": 0,
        "sync_sources": 0,
        "people": 0,
        "albums": 0,
        "media": 0,
        "faces": 0,
        "embeddings": 0,
        "video_keyframes": 0,
        "album_associations": 0
    }

    try:
        if tgt_is_postgres:
            try:
                tgt_db.execute(text("SET session_replication_role = 'replica';"))
                tgt_db.commit()
            except Exception as e:
                logger.warning(f"Could not set replica role: {e}")

        # 1. Users
        existing_user_ids = set(r[0] for r in tgt_db.query(User.id).all())
        new_users = [clone_record(u) for u in src_db.query(User).all() if u.id not in existing_user_ids]
        if new_users:
            tgt_db.add_all(new_users)
            stats["users"] = len(new_users)
            tgt_db.commit()
        valid_user_ids = set(r[0] for r in tgt_db.query(User.id).all())

        # 2. Sync Sources
        existing_sync_ids = set(r[0] for r in tgt_db.query(SyncSource.id).all())
        new_sync = []
        for s in src_db.query(SyncSource).all():
            if s.id not in existing_sync_ids and (s.user_id is None or s.user_id in valid_user_ids):
                new_sync.append(clone_record(s))
        if new_sync:
            tgt_db.add_all(new_sync)
            stats["sync_sources"] = len(new_sync)
            tgt_db.commit()

        # 2b. App Settings
        try:
            existing_setting_keys = set(r[0] for r in tgt_db.query(AppSetting.key).all())
            new_settings = [clone_record(s) for s in src_db.query(AppSetting).all() if s.key not in existing_setting_keys]
            if new_settings:
                tgt_db.add_all(new_settings)
                tgt_db.commit()
                stats["app_settings"] = len(new_settings)
        except Exception as e:
            logger.warning(f"Could not copy app settings: {e}")

        # 3. Media (bulk chunks of 1000, must precede People and FaceDetection)
        existing_media_ids = set(r[0] for r in tgt_db.query(Media.id).all())
        media_batch = []
        for m in src_db.query(Media).all():
            if m.id not in existing_media_ids:
                cloned_m = clone_record(m)
                if cloned_m.user_id and cloned_m.user_id not in valid_user_ids:
                    cloned_m.user_id = None
                media_batch.append(cloned_m)
                stats["media"] += 1
                if len(media_batch) >= 1000:
                    tgt_db.bulk_save_objects(media_batch)
                    tgt_db.commit()
                    media_batch = []
        if media_batch:
            tgt_db.bulk_save_objects(media_batch)
            tgt_db.commit()
        valid_media_ids = set(r[0] for r in tgt_db.query(Media.id).all())

        # 4. People (references valid_media_ids for cover_media_id)
        existing_people_ids = set(r[0] for r in tgt_db.query(Person.id).all())
        people_batch = []
        for p in src_db.query(Person).all():
            if p.id not in existing_people_ids:
                cloned_p = clone_record(p)
                if cloned_p.user_id and cloned_p.user_id not in valid_user_ids:
                    cloned_p.user_id = None
                if cloned_p.cover_media_id and cloned_p.cover_media_id not in valid_media_ids:
                    cloned_p.cover_media_id = None
                people_batch.append(cloned_p)
                stats["people"] += 1
                if len(people_batch) >= 1000:
                    tgt_db.bulk_save_objects(people_batch)
                    tgt_db.commit()
                    people_batch = []
        if people_batch:
            tgt_db.bulk_save_objects(people_batch)
            tgt_db.commit()
        valid_people_ids = set(r[0] for r in tgt_db.query(Person.id).all())

        # 5. Albums
        existing_album_ids = set(r[0] for r in tgt_db.query(Album.id).all())
        new_albums = []
        for a in src_db.query(Album).all():
            if a.id not in existing_album_ids:
                cloned_a = clone_record(a)
                if cloned_a.user_id and cloned_a.user_id not in valid_user_ids:
                    cloned_a.user_id = None
                if cloned_a.cover_media_id and cloned_a.cover_media_id not in valid_media_ids:
                    cloned_a.cover_media_id = None
                new_albums.append(cloned_a)
        if new_albums:
            tgt_db.add_all(new_albums)
            stats["albums"] = len(new_albums)
            tgt_db.commit()
        valid_album_ids = set(r[0] for r in tgt_db.query(Album.id).all())

        # 6. Face Detections (bulk chunks of 1000, validated against valid_media_ids & valid_people_ids)
        existing_face_ids = set(r[0] for r in tgt_db.query(FaceDetection.id).all())
        face_batch = []
        for f in src_db.query(FaceDetection).all():
            if f.id not in existing_face_ids and f.media_id in valid_media_ids:
                cloned_f = clone_record(f)
                if cloned_f.person_id and cloned_f.person_id not in valid_people_ids:
                    cloned_f.person_id = None
                face_batch.append(cloned_f)
                stats["faces"] += 1
                if len(face_batch) >= 1000:
                    tgt_db.bulk_save_objects(face_batch)
                    tgt_db.commit()
                    face_batch = []
        if face_batch:
            tgt_db.bulk_save_objects(face_batch)
            tgt_db.commit()

        # 7. Media-Album Associations (bulk set lookup)
        try:
            src_assocs = src_db.execute(album_media.select()).fetchall()
            tgt_assocs = set((r[0], r[1]) for r in tgt_db.execute(album_media.select()).fetchall())
            to_insert = [
                {"album_id": r.album_id, "media_id": r.media_id}
                for r in src_assocs
                if (r.album_id, r.media_id) not in tgt_assocs
                and r.album_id in valid_album_ids
                and r.media_id in valid_media_ids
            ]
            if to_insert:
                tgt_db.execute(album_media.insert(), to_insert)
                stats["album_associations"] = len(to_insert)
                tgt_db.commit()
        except Exception as e:
            logger.warning(f"Error copying album associations: {e}")

        # 8. Media Embeddings (with pgvector array & binary dual populating, bulk chunks of 1000)
        existing_emb_mids = set(r[0] for r in tgt_db.query(MediaEmbedding.media_id).all())
        emb_batch = []
        for emb in src_db.query(MediaEmbedding).all():
            if emb.media_id not in existing_emb_mids and emb.media_id in valid_media_ids:
                vec_bytes = emb.vector
                vec_list = None
                if vec_bytes:
                    try:
                        arr = np.frombuffer(vec_bytes, dtype=np.float32)
                        vec_list = arr.tolist()
                    except Exception:
                        pass
                
                new_emb = MediaEmbedding(
                    id=emb.id,
                    media_id=emb.media_id,
                    vector=vec_bytes,
                    embedding=vec_list if tgt_is_postgres else None,
                    created_at=emb.created_at
                )
                emb_batch.append(new_emb)
                stats["embeddings"] += 1
                if len(emb_batch) >= 1000:
                    tgt_db.bulk_save_objects(emb_batch)
                    tgt_db.commit()
                    emb_batch = []
        if emb_batch:
            tgt_db.bulk_save_objects(emb_batch)
            tgt_db.commit()

        # 9. Video Keyframes (with pgvector array & binary dual populating, bulk chunks of 1000)
        try:
            existing_kf_ids = set(r[0] for r in tgt_db.query(VideoKeyframe.id).all())
            kf_batch = []
            for kf in src_db.query(VideoKeyframe).all():
                if kf.id not in existing_kf_ids and kf.media_id in valid_media_ids:
                    vec_bytes = kf.vector
                    vec_list = None
                    if vec_bytes:
                        try:
                            arr = np.frombuffer(vec_bytes, dtype=np.float32)
                            vec_list = arr.tolist()
                        except Exception:
                            pass
                    
                    new_kf = VideoKeyframe(
                        id=kf.id,
                        media_id=kf.media_id,
                        timestamp_seconds=kf.timestamp_seconds,
                        thumbnail_path=kf.thumbnail_path,
                        vector=vec_bytes,
                        embedding=vec_list if tgt_is_postgres else None,
                        created_at=kf.created_at
                    )
                    kf_batch.append(new_kf)
                    stats["video_keyframes"] += 1
                    if len(kf_batch) >= 1000:
                        tgt_db.bulk_save_objects(kf_batch)
                        tgt_db.commit()
                        kf_batch = []
            if kf_batch:
                tgt_db.bulk_save_objects(kf_batch)
                tgt_db.commit()
        except Exception as e:
            logger.warning(f"Could not migrate video keyframes: {e}")

        # If target is PostgreSQL, ensure HNSW index is built and serial sequences are updated
        hnsw_res = None
        if tgt_is_postgres:
            hnsw_res = ensure_pgvector_hnsw_index(tgt_engine)

            seq_tables = [
                'users', 'sync_sources', 'media', 'people', 'albums',
                'face_detections', 'media_embeddings', 'video_keyframes'
            ]
            with tgt_engine.connect() as conn:
                for tbl in seq_tables:
                    try:
                        conn.execute(text(f"SELECT setval(pg_get_serial_sequence('{tbl}', 'id'), coalesce((SELECT max(id) FROM {tbl}), 1));"))
                        conn.commit()
                    except Exception as seq_err:
                        logger.debug(f"Sequence reset for {tbl}: {seq_err}")

        elapsed = round(time.time() - start_time, 2)
        logger.info(f"Database migration finished successfully in {elapsed}s: {stats}")

        return {
            "success": True,
            "duration_seconds": elapsed,
            "source_dialect": "sqlite" if src_url.startswith("sqlite") else "postgresql",
            "target_dialect": "postgresql" if tgt_is_postgres else "sqlite",
            "migrated_stats": stats,
            "hnsw_index": hnsw_res
        }

    except Exception as e:
        tgt_db.rollback()
        logger.error(f"Migration error: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "partial_stats": stats
        }
    finally:
        if tgt_is_postgres:
            try:
                tgt_db.execute(text("SET session_replication_role = 'origin';"))
                tgt_db.commit()
            except Exception:
                pass
        src_db.close()
        tgt_db.close()
