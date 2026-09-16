import time
import logging
import numpy as np
from typing import Dict, Any, Optional
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db_dialect, is_postgres, is_sqlite, check_pgvector_active, check_postgres_availability
from app.models.user import User
from app.models.media import Media, MediaEmbedding
from app.models.person import Person, FaceDetection
from app.models.album import Album, album_media
from app.models.sync import SyncSource

logger = logging.getLogger(__name__)

def get_database_status() -> Dict[str, Any]:
    """
    Returns comprehensive telemetry about the current active database (SQLite or PostgreSQL),
    table counts, pgvector availability, and HNSW vector index status.
    """
    dialect = get_db_dialect()
    from app.database import engine, SessionLocal
    
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
        }
    except Exception as e:
        logger.warning(f"Could not read table counts: {e}")
    finally:
        db.close()

    # Check HNSW index status if in postgres
    hnsw_index_exists = False
    if is_postgres:
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
        "is_sqlite": is_sqlite,
        "is_postgres": is_postgres,
        "table_counts": table_counts,
        "pgvector_active": check_pgvector_active() if is_postgres else False,
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
            data[col] = getattr(instance, col)
    return cls(**data)

def migrate_database(source_url: Optional[str] = None, target_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Migrates all data seamlessly between SQLite and PostgreSQL (or any two SQLAlchemy databases).
    Handles vector conversions (raw byte buffers <-> 512-dim pgvector arrays).
    """
    start_time = time.time()
    
    # Default: migrate from current active DATABASE_URL to POSTGRES_URL
    src_url = source_url or settings.DATABASE_URL
    tgt_url = target_url or settings.POSTGRES_URL

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
        "album_associations": 0
    }

    try:
        # 1. Users
        for u in src_db.query(User).all():
            if not tgt_db.query(User).filter(User.id == u.id).first():
                tgt_db.add(clone_record(u))
                stats["users"] += 1
        tgt_db.commit()

        # 2. Sync Sources
        for s in src_db.query(SyncSource).all():
            if not tgt_db.query(SyncSource).filter(SyncSource.id == s.id).first():
                tgt_db.add(clone_record(s))
                stats["sync_sources"] += 1
        tgt_db.commit()

        # 3. People
        for p in src_db.query(Person).all():
            if not tgt_db.query(Person).filter(Person.id == p.id).first():
                tgt_db.add(clone_record(p))
                stats["people"] += 1
        tgt_db.commit()

        # 4. Media (must precede Albums and FaceDetections due to foreign keys)
        for m in src_db.query(Media).all():
            if not tgt_db.query(Media).filter(Media.id == m.id).first():
                tgt_db.add(clone_record(m))
                stats["media"] += 1
        tgt_db.commit()

        # 5. Albums
        for a in src_db.query(Album).all():
            if not tgt_db.query(Album).filter(Album.id == a.id).first():
                tgt_db.add(clone_record(a))
                stats["albums"] += 1
        tgt_db.commit()

        # 6. Face Detections
        for f in src_db.query(FaceDetection).all():
            if not tgt_db.query(FaceDetection).filter(FaceDetection.id == f.id).first():
                tgt_db.add(clone_record(f))
                stats["faces"] += 1
        tgt_db.commit()

        # 7. Media-Album Associations
        try:
            assoc_rows = src_db.execute(album_media.select()).fetchall()
            for r in assoc_rows:
                # check if exists
                existing = tgt_db.execute(
                    album_media.select().where(
                        (album_media.c.media_id == r.media_id) & 
                        (album_media.c.album_id == r.album_id)
                    )
                ).fetchone()
                if not existing:
                    tgt_db.execute(album_media.insert().values(media_id=r.media_id, album_id=r.album_id))
                    stats["album_associations"] += 1
            tgt_db.commit()
        except Exception as e:
            logger.warning(f"Error copying album associations: {e}")

        # 8. Media Embeddings (with pgvector array & binary dual populating)
        embeddings = src_db.query(MediaEmbedding).all()
        for emb in embeddings:
            if not tgt_db.query(MediaEmbedding).filter(MediaEmbedding.media_id == emb.media_id).first():
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
                tgt_db.add(new_emb)
                stats["embeddings"] += 1
        tgt_db.commit()

        # If target is PostgreSQL, ensure HNSW index is built
        hnsw_res = None
        if tgt_is_postgres:
            hnsw_res = ensure_pgvector_hnsw_index(tgt_engine)

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
        src_db.close()
        tgt_db.close()
