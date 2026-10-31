import os
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.models.user import User
from app.models.media import Media, MediaCategory, SourceType
from app.api.auth import get_current_user, get_optional_current_user
from app.services.burst_engine import (
    detect_burst_clusters,
    resolve_burst_cluster,
    resolve_all_bursts
)

router = APIRouter()

class BatchActionRequest(BaseModel):
    media_ids: List[int]
    permanent: bool = False

class SnoozeRequest(BaseModel):
    media_ids: List[int]
    days: int = 30

@router.get("/overview")
def get_triage_overview(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns high-level statistics for the Triage & Cleanup dashboard strictly for current user:
    - Screenshots count and count of those expiring in the next 7 days
    - Bills & Receipts count
    - Blurry shots count
    - Estimated reclaimable disk space
    """
    if not current_user:
        return {
            "total_screenshots": 0,
            "expiring_screenshots": 0,
            "total_bills_receipts": 0,
            "total_blurry": 0,
            "total_pocket_shots": 0,
            "total_motion_blur": 0,
            "total_bokeh": 0,
            "total_memes": 0,
            "reclaimable_bytes": 0,
            "reclaimable_mb": 0.0
        }

    now = datetime.utcnow()
    seven_days = now + timedelta(days=7)
    uid = current_user.id
    
    total_screenshots = db.query(Media).filter(
        Media.user_id == uid,
        Media.category == MediaCategory.SCREENSHOT,
        Media.is_deleted == False
    ).count()
    
    expiring_screenshots = db.query(Media).filter(
        Media.user_id == uid,
        Media.category == MediaCategory.SCREENSHOT,
        Media.expires_at <= seven_days,
        Media.is_deleted == False
    ).count()
    
    total_bills = db.query(Media).filter(
        Media.user_id == uid,
        Media.category == MediaCategory.DOCUMENT_BILL,
        Media.is_deleted == False
    ).count()
    
    total_blurry = db.query(Media).filter(
        Media.user_id == uid,
        Media.is_blurry == True,
        Media.is_bokeh == False,
        Media.is_deleted == False
    ).count()

    total_pocket_shots = db.query(Media).filter(
        Media.user_id == uid,
        Media.blur_type == "black_pocket",
        Media.is_deleted == False
    ).count()

    total_motion_blur = db.query(Media).filter(
        Media.user_id == uid,
        Media.blur_type == "motion_blur",
        Media.is_deleted == False
    ).count()

    total_bokeh = db.query(Media).filter(
        Media.user_id == uid,
        Media.is_bokeh == True,
        Media.is_deleted == False
    ).count()
    
    total_memes = db.query(Media).filter(
        Media.user_id == uid,
        Media.category == MediaCategory.MEME_JUNK,
        Media.is_deleted == False
    ).count()
    
    # Calculate reclaimable bytes from clutter (expired screenshots + blurry + memes)
    clutter_size = db.query(func.sum(Media.file_size)).filter(
        Media.user_id == uid,
        (
            (Media.category == MediaCategory.SCREENSHOT) & (Media.expires_at <= now)
        ) | (
            (Media.is_blurry == True) & (Media.is_bokeh == False)
        ) | (
            Media.category == MediaCategory.MEME_JUNK
        ),
        Media.is_deleted == False
    ).scalar() or 0
    
    return {
        "total_screenshots": total_screenshots,
        "expiring_screenshots": expiring_screenshots,
        "total_bills_receipts": total_bills,
        "total_blurry": total_blurry,
        "total_pocket_shots": total_pocket_shots,
        "total_motion_blur": total_motion_blur,
        "total_bokeh": total_bokeh,
        "total_memes": total_memes,
        "reclaimable_bytes": clutter_size,
        "reclaimable_mb": round(clutter_size / (1024 * 1024), 2)
    }

@router.get("/screenshots")
def get_screenshots(
    filter_expired: bool = False,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Lists screenshots for current user with expiry countdown information."""
    if not current_user:
        return []
    now = datetime.utcnow()
    query = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.category == MediaCategory.SCREENSHOT,
        Media.is_deleted == False
    )
    if filter_expired:
        query = query.filter(Media.expires_at <= now)
        
    items = query.order_by(Media.expires_at.asc().nullslast()).all()
    
    results = []
    for item in items:
        days_left = None
        is_expired = False
        if item.expires_at:
            delta = item.expires_at - now
            days_left = delta.days
            is_expired = delta.total_seconds() <= 0
            
        results.append({
            "id": item.id,
            "filename": item.filename,
            "captured_at": item.captured_at,
            "expires_at": item.expires_at,
            "days_left": days_left,
            "is_expired": is_expired,
            "file_size": item.file_size,
            "source_type": (item.source_type.value if hasattr(item.source_type, "value") else str(item.source_type)) if item.source_type else "local",
            "source_id": item.source_id,
            "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
        })
    return results

@router.get("/bills")
def get_bills_and_receipts(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Lists all detected documents, invoices, and bills for current user."""
    if not current_user:
        return []
    items = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.category == MediaCategory.DOCUMENT_BILL,
        Media.is_deleted == False
    ).order_by(desc(Media.captured_at)).all()
    
    return [{
        "id": item.id,
        "filename": item.filename,
        "captured_at": item.captured_at,
        "file_size": item.file_size,
        "extracted_text": item.extracted_text,
        "source_type": (item.source_type.value if hasattr(item.source_type, "value") else str(item.source_type)) if item.source_type else "local",
        "source_id": item.source_id,
        "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
    } for item in items]

@router.get("/duplicates")
@router.get("/bursts")
def get_duplicate_and_burst_clusters(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Groups items into Rapid Burst sequences and Perceptual Duplicates for current user.
    """
    if not current_user:
        return []
    clusters = detect_burst_clusters(db, user_id=current_user.id)
    for c in clusters:
        c["hash"] = c["id"]
    return clusters

class ResolveDuplicatesRequest(BaseModel):
    keep_media_id: int
    delete_media_ids: List[int]

@router.post("/resolve-duplicates")
@router.post("/bursts/resolve")
def resolve_duplicates(
    req: ResolveDuplicatesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Keeps the selected best shot and soft-deletes the redundant duplicate photos.
    Ensures user cannot modify another user's photos.
    """
    all_target_ids = [req.keep_media_id] + req.delete_media_ids
    owned_count = db.query(Media).filter(
        Media.id.in_(all_target_ids),
        Media.user_id == current_user.id
    ).count()
    if owned_count != len(all_target_ids) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden: Cannot resolve bursts across different accounts.")

    return resolve_burst_cluster(db, req.keep_media_id, req.delete_media_ids)

@router.get("/bills/{media_id}/inspect")
def inspect_bill_document(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Detailed inspection for a bill/receipt document owned by current user.
    """
    import re
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    text = media.extracted_text or ""
    
    amount_matches = re.findall(r'(?:total|amount|sum|usd|\$|€|£|₹)\s*[:=]?\s*([0-9]+[.,][0-9]{2})', text, re.IGNORECASE)
    if not amount_matches:
        amount_matches = re.findall(r'[$€£₹]\s*([0-9]+[.,][0-9]{2})', text)
    
    date_matches = re.findall(r'\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b', text, re.IGNORECASE)

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    merchant_name = lines[0] if lines else "Scanned Document"

    return {
        "id": media.id,
        "filename": media.filename,
        "captured_at": media.captured_at,
        "file_size": media.file_size,
        "width": media.width,
        "height": media.height,
        "merchant_name": merchant_name,
        "detected_amounts": amount_matches,
        "detected_dates": date_matches,
        "extracted_text": text,
        "lines_count": len(lines),
        "thumbnail_url": f"/api/v1/media/{media.id}/thumbnail?size=1080"
    }

@router.post("/snooze")
def snooze_screenshots(
    req: SnoozeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Extends the expiry date of selected user screenshots by N days."""
    new_expiry = datetime.utcnow() + timedelta(days=req.days)
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id
    ).update({"expires_at": new_expiry}, synchronize_session=False)
    db.commit()
    return {"status": "snoozed", "count": updated, "new_expiry": new_expiry}

@router.post("/batch-delete")
def batch_delete(
    req: BatchActionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deletes user clutter in batch, supporting both soft trash and permanent cloud deletion."""
    items = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id
    ).all()

    from app.services.google_sync import delete_file_from_google_drive
    from concurrent.futures import ThreadPoolExecutor

    gdrive_items = [m for m in items if m.source_type == SourceType.GOOGLE_DRIVE and m.source_id]
    if gdrive_items:
        def _del_g(m):
            delete_file_from_google_drive(db, m.source_id, current_user.id, permanent=req.permanent)
        with ThreadPoolExecutor(max_workers=min(len(gdrive_items), 8)) as executor:
            list(executor.map(_del_g, gdrive_items))

    for item in items:
        if item.source_type == SourceType.S3_MINIO and item.source_id and req.permanent:
            try:
                from app.services.s3_storage import delete_s3_object
                delete_s3_object(item.source_id)
            except Exception:
                pass

        if req.permanent:
            if item.original_path and os.path.isfile(item.original_path):
                try:
                    os.remove(item.original_path)
                except Exception:
                    pass
            db.delete(item)
        else:
            item.is_deleted = True

    db.commit()
    return {"status": "deleted", "count": len(items), "permanent": req.permanent}

@router.get("/memes")
def get_memes_and_graphics(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Lists detected memes and social media junk for current user."""
    if not current_user:
        return []
    items = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.category == MediaCategory.MEME_JUNK,
        Media.is_deleted == False
    ).order_by(desc(Media.captured_at)).all()
    
    return [{
        "id": item.id,
        "filename": item.filename,
        "captured_at": item.captured_at,
        "file_size": item.file_size,
        "source_type": (item.source_type.value if hasattr(item.source_type, "value") else str(item.source_type)) if item.source_type else "local",
        "source_id": item.source_id,
        "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
    } for item in items]

@router.get("/large-files")
def get_large_storage_files(
    min_mb: float = 3.0,
    limit: int = 50,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Lists largest files in the current user's library."""
    if not current_user:
        return []
    min_bytes = int(min_mb * 1024 * 1024)
    items = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.file_size >= min_bytes,
        Media.is_deleted == False
    ).order_by(desc(Media.file_size)).limit(limit).all()
    
    return [{
        "id": item.id,
        "filename": item.filename,
        "category": item.category.value if hasattr(item.category, 'value') else str(item.category),
        "file_size": item.file_size,
        "file_size_mb": round(item.file_size / (1024 * 1024), 2),
        "width": item.width,
        "height": item.height,
        "captured_at": item.captured_at,
        "source_type": (item.source_type.value if hasattr(item.source_type, "value") else str(item.source_type)) if item.source_type else "local",
        "source_id": item.source_id,
        "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
    } for item in items]

@router.post("/move-to-memories")
def move_to_memories(
    req: BatchActionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reclassifies user items as permanent memories, removing them from triage trays."""
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id
    ).update({
        "category": MediaCategory.MEMORY,
        "expires_at": None
    }, synchronize_session=False)
    db.commit()
    return {"status": "moved_to_memories", "count": updated}

@router.post("/mark-sharp")
def mark_as_sharp(
    req: BatchActionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Marks selected user photos as not blurry (dismisses blur flag)."""
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id
    ).update({"is_blurry": False}, synchronize_session=False)
    db.commit()
    return {"status": "marked_sharp", "count": updated}

@router.post("/resolve-all-duplicates")
@router.post("/bursts/resolve-all")
def resolve_all_duplicates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Auto-resolves all duplicate and burst clusters for current user.
    """
    return resolve_all_bursts(db, user_id=current_user.id)

@router.get("/blurry")
def get_blurry_photos(
    blur_type: Optional[str] = Query(None, regex="^(all|motion_blur|out_of_focus|black_pocket|blown_white)$"),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Lists photos flagged as blurry or poor quality for current user.
    """
    if not current_user:
        return []
    query = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.is_blurry == True,
        Media.is_bokeh == False,
        Media.is_deleted == False
    )

    if blur_type and blur_type != "all":
        query = query.filter(Media.blur_type == blur_type)

    items = query.order_by(desc(Media.captured_at)).all()

    return [{
        "id": item.id,
        "filename": item.filename,
        "captured_at": item.captured_at,
        "file_size": item.file_size,
        "blur_type": getattr(item, "blur_type", "out_of_focus") or "out_of_focus",
        "blurriness_score": item.blurriness_score,
        "is_blurry": item.is_blurry,
        "is_bokeh": getattr(item, "is_bokeh", False) or False,
        "is_enhanced": getattr(item, "is_enhanced", False) or False,
        "source_type": (item.source_type.value if hasattr(item.source_type, "value") else str(item.source_type)) if item.source_type else "local",
        "source_id": item.source_id,
        "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
    } for item in items]

@router.post("/pocket-shots/cleanup")
def cleanup_pocket_shots(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Soft-deletes all pitch black / pocket shots for current user.
    """
    updated = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.blur_type == "black_pocket",
        Media.is_deleted == False
    ).update({"is_deleted": True}, synchronize_session=False)
    db.commit()
    return {"status": "success", "count": updated}
