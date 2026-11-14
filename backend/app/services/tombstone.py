import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.models.media import DeletedMediaTombstone

logger = logging.getLogger("memorypics.tombstone")

def record_deleted_tombstone(
    db: Session,
    file_hash: Optional[str],
    filename: Optional[str] = None,
    file_size: Optional[int] = 0,
    user_id: Optional[int] = None
) -> bool:
    """
    Safely records a tombstone for permanently deleted media items.
    Uses ON CONFLICT DO NOTHING on PostgreSQL and savepoint on SQLite
    to guarantee zero IntegrityErrors or unique constraint violations during batch operations.
    """
    if not file_hash:
        return False

    try:
        bind = db.get_bind() if hasattr(db, "get_bind") else getattr(db, "bind", None)
        dialect_name = bind.dialect.name if bind else ""
        if dialect_name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(DeletedMediaTombstone).values(
                file_hash=file_hash,
                filename=filename,
                file_size=file_size or 0,
                user_id=user_id,
                deleted_at=datetime.utcnow()
            ).on_conflict_do_nothing(index_elements=['file_hash'])
            db.execute(stmt)
            return True
        else:
            with db.begin_nested():
                exists = db.query(DeletedMediaTombstone.id).filter(DeletedMediaTombstone.file_hash == file_hash).first()
                if not exists:
                    db.add(DeletedMediaTombstone(
                        file_hash=file_hash,
                        filename=filename,
                        file_size=file_size or 0,
                        user_id=user_id,
                        deleted_at=datetime.utcnow()
                    ))
                    db.flush()
            return True
    except Exception as e:
        logger.warning(f"Could not record tombstone for hash {file_hash}: {e}")
        return False
