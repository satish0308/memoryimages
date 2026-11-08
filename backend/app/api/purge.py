import os
import logging
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.media import Media
from app.api.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

CONTAINER_PREFIX = "/data/originals/all_extracts/"
HOST_PREFIX = "/media/satish/Data2/all_extracts/"

def map_container_to_host_path(container_path: Optional[str]) -> Optional[str]:
    """Translates a docker container original_path to the physical host filesystem path."""
    if not container_path:
        return None
    if container_path.startswith(CONTAINER_PREFIX):
        return container_path.replace(CONTAINER_PREFIX, HOST_PREFIX, 1)
    if container_path.startswith("/data/originals/"):
        return container_path.replace("/data/originals/", "./data/originals/", 1)
    return container_path

class CancelPendingRequest(BaseModel):
    media_ids: Optional[List[int]] = None
    cancel_all: bool = False

class ConfirmPurgedRequest(BaseModel):
    media_ids: Optional[List[int]] = None
    confirm_all: bool = False
    force: bool = False  # If True, delete DB record even if file still exists on read-only mount

@router.get("/pending")
def get_pending_disk_deletions(
    skip: int = 0,
    limit: int = 200,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns all media items marked for permanent deletion on read-only volume mounts
    that are pending execution of the host-level deletion script.
    """
    query = db.query(Media).filter(
        Media.pending_disk_deletion == True
    )
    if not current_user.is_admin:
        query = query.filter(Media.user_id == current_user.id)

    total_count = query.count()
    items = query.order_by(Media.marked_for_deletion_at.desc().nullslast()).offset(skip).limit(limit).all()

    total_bytes = db.query(Media.file_size).filter(Media.pending_disk_deletion == True)
    if not current_user.is_admin:
        total_bytes = total_bytes.filter(Media.user_id == current_user.id)
    total_size_bytes = sum(r[0] or 0 for r in total_bytes.all())

    result_items = []
    for item in items:
        host_p = map_container_to_host_path(item.original_path)
        file_exists = os.path.exists(item.original_path) if item.original_path else False
        result_items.append({
            "id": item.id,
            "filename": item.filename,
            "original_path": item.original_path,
            "host_path": host_p,
            "file_size": item.file_size or 0,
            "mime_type": item.mime_type,
            "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256",
            "marked_for_deletion_at": item.marked_for_deletion_at.isoformat() if item.marked_for_deletion_at else None,
            "file_exists_in_mount": file_exists
        })

    return {
        "total_count": total_count,
        "total_size_bytes": total_size_bytes,
        "items": result_items,
        "host_prefix": HOST_PREFIX,
        "container_prefix": CONTAINER_PREFIX,
        "purge_script_path": "./scripts/delete_files_marked_as_deleted.sh"
    }

@router.post("/cancel")
def cancel_pending_disk_deletions(
    req: CancelPendingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Restores items from the pending disk purge queue back to active status,
    resetting pending_disk_deletion and is_deleted flags.
    """
    query = db.query(Media).filter(Media.pending_disk_deletion == True)
    if not current_user.is_admin:
        query = query.filter(Media.user_id == current_user.id)

    if not req.cancel_all:
        if not req.media_ids:
            raise HTTPException(status_code=400, detail="Provide media_ids or set cancel_all=True")
        query = query.filter(Media.id.in_(req.media_ids))

    items = query.all()
    count = len(items)
    for item in items:
        item.pending_disk_deletion = False
        item.is_deleted = False
        item.marked_for_deletion_at = None

    db.commit()
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

    return {
        "status": "cancelled",
        "restored_count": count
    }

@router.post("/confirm")
def confirm_disk_purged(
    req: ConfirmPurgedRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Called by the OS-level deletion script (or admin) after files have been physically
    removed from the host drive. Purges database records, thumbnails, and AI vector embeddings.
    """
    query = db.query(Media).filter(Media.pending_disk_deletion == True)
    if not current_user.is_admin:
        query = query.filter(Media.user_id == current_user.id)

    if not req.confirm_all:
        if not req.media_ids:
            raise HTTPException(status_code=400, detail="Provide media_ids or set confirm_all=True")
        query = query.filter(Media.id.in_(req.media_ids))

    items = query.all()
    purged_count = 0
    skipped_count = 0
    skipped_reasons = []

    for item in items:
        # Check if file still exists on read-only mount (unless forced)
        if not req.force and item.original_path and os.path.exists(item.original_path):
            skipped_count += 1
            skipped_reasons.append({
                "id": item.id,
                "filename": item.filename,
                "reason": "File still physically exists on mount. Run the OS script first or use force=True."
            })
            continue

        # Safely remove generated thumbnails on disk if any
        for thumb_path in [item.thumbnail_256_path, item.thumbnail_1080_path]:
            if thumb_path and os.path.isfile(thumb_path):
                try:
                    os.remove(thumb_path)
                except Exception:
                    pass

        db.delete(item)
        purged_count += 1

    db.commit()
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

    return {
        "status": "success",
        "purged_count": purged_count,
        "skipped_count": skipped_count,
        "skipped_items": skipped_reasons
    }
