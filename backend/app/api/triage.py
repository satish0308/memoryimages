from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.models.media import Media, MediaCategory

router = APIRouter()

class BatchActionRequest(BaseModel):
    media_ids: List[int]

class SnoozeRequest(BaseModel):
    media_ids: List[int]
    days: int = 30

@router.get("/overview")
def get_triage_overview(db: Session = Depends(get_db)):
    """
    Returns high-level statistics for the Triage & Cleanup dashboard:
    - Screenshots count and count of those expiring in the next 7 days
    - Bills & Receipts count
    - Blurry shots count
    - Estimated reclaimable disk space
    """
    now = datetime.utcnow()
    seven_days = now + timedelta(days=7)
    
    total_screenshots = db.query(Media).filter(
        Media.category == MediaCategory.SCREENSHOT,
        Media.is_deleted == False
    ).count()
    
    expiring_screenshots = db.query(Media).filter(
        Media.category == MediaCategory.SCREENSHOT,
        Media.expires_at <= seven_days,
        Media.is_deleted == False
    ).count()
    
    total_bills = db.query(Media).filter(
        Media.category == MediaCategory.DOCUMENT_BILL,
        Media.is_deleted == False
    ).count()
    
    total_blurry = db.query(Media).filter(
        Media.is_blurry == True,
        Media.is_deleted == False
    ).count()
    
    total_memes = db.query(Media).filter(
        Media.category == MediaCategory.MEME_JUNK,
        Media.is_deleted == False
    ).count()
    
    # Calculate reclaimable bytes from clutter (expired screenshots + blurry + memes)
    clutter_size = db.query(func.sum(Media.file_size)).filter(
        (
            (Media.category == MediaCategory.SCREENSHOT) & (Media.expires_at <= now)
        ) | (
            Media.is_blurry == True
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
        "total_memes": total_memes,
        "reclaimable_bytes": clutter_size,
        "reclaimable_mb": round(clutter_size / (1024 * 1024), 2)
    }

@router.get("/screenshots")
def get_screenshots(
    filter_expired: bool = False,
    db: Session = Depends(get_db)
):
    """Lists screenshots with expiry countdown information."""
    now = datetime.utcnow()
    query = db.query(Media).filter(
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
            "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
        })
    return results

@router.get("/bills")
def get_bills_and_receipts(db: Session = Depends(get_db)):
    """Lists all detected documents, invoices, and bills."""
    items = db.query(Media).filter(
        Media.category == MediaCategory.DOCUMENT_BILL,
        Media.is_deleted == False
    ).order_by(desc(Media.captured_at)).all()
    
    return [{
        "id": item.id,
        "filename": item.filename,
        "captured_at": item.captured_at,
        "file_size": item.file_size,
        "extracted_text": item.extracted_text,
        "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
    } for item in items]

@router.get("/duplicates")
def get_duplicate_clusters(db: Session = Depends(get_db)):
    """
    Groups items by identical or near-identical perceptual hash (pHash).
    """
    # Find perceptual hashes shared by > 1 media item
    duplicate_hashes = db.query(Media.perceptual_hash).filter(
        Media.perceptual_hash != None,
        Media.is_deleted == False
    ).group_by(Media.perceptual_hash).having(func.count(Media.id) > 1).all()
    
    hashes = [h[0] for h in duplicate_hashes]
    clusters = []
    
    for h in hashes:
        items = db.query(Media).filter(
            Media.perceptual_hash == h,
            Media.is_deleted == False
        ).order_by(desc(Media.captured_at)).all()
        
        clusters.append({
            "hash": h,
            "count": len(items),
            "items": [{
                "id": m.id,
                "filename": m.filename,
                "file_size": m.file_size,
                "width": m.width,
                "height": m.height,
                "blurriness_score": m.blurriness_score,
                "is_blurry": m.is_blurry,
                "captured_at": m.captured_at,
                "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256"
            } for m in items]
        })
        
    return clusters

class ResolveDuplicatesRequest(BaseModel):
    keep_media_id: int
    delete_media_ids: List[int]

@router.post("/resolve-duplicates")
def resolve_duplicates(req: ResolveDuplicatesRequest, db: Session = Depends(get_db)):
    """
    Keeps the selected best shot and soft-deletes the redundant duplicate photos.
    Adheres strictly to the safe zero auto-deletion policy with manual confirmation.
    """
    if not req.delete_media_ids:
        return {"status": "no_op", "count": 0}

    deleted_count = db.query(Media).filter(
        Media.id.in_(req.delete_media_ids)
    ).update({"is_deleted": True}, synchronize_session=False)
    db.commit()

    return {
        "status": "resolved",
        "kept_media_id": req.keep_media_id,
        "deleted_count": deleted_count
    }

@router.get("/bills/{media_id}/inspect")
def inspect_bill_document(media_id: int, db: Session = Depends(get_db)):
    """
    Detailed inspection for a bill/receipt document:
    Extracts detected amounts, date, merchant title, and itemized text.
    """
    import re
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    text = media.extracted_text or ""
    
    # Parse total amounts: e.g. $42.50, 150.00, EUR 99.90, etc.
    amount_matches = re.findall(r'(?:total|amount|sum|usd|\$|€|£|₹)\s*[:=]?\s*([0-9]+[.,][0-9]{2})', text, re.IGNORECASE)
    if not amount_matches:
        amount_matches = re.findall(r'[$€£₹]\s*([0-9]+[.,][0-9]{2})', text)
    
    # Parse dates: e.g. 10/25/2024, 2024-10-25, Oct 25, 2024
    date_matches = re.findall(r'\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b', text, re.IGNORECASE)

    # First non-empty lines as potential merchant/header
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
def snooze_screenshots(req: SnoozeRequest, db: Session = Depends(get_db)):
    """Extends the expiry date of selected screenshots by N days."""
    new_expiry = datetime.utcnow() + timedelta(days=req.days)
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids)
    ).update({"expires_at": new_expiry}, synchronize_session=False)
    db.commit()
    return {"status": "snoozed", "count": updated, "new_expiry": new_expiry}

@router.post("/batch-delete")
def batch_delete(req: BatchActionRequest, db: Session = Depends(get_db)):
    """Soft-deletes or purges unwanted clutter in batch."""
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids)
    ).update({"is_deleted": True}, synchronize_session=False)
    db.commit()
    return {"status": "deleted", "count": updated}

@router.get("/memes")
def get_memes_and_graphics(db: Session = Depends(get_db)):
    """Lists all detected memes and social media junk."""
    items = db.query(Media).filter(
        Media.category == MediaCategory.MEME_JUNK,
        Media.is_deleted == False
    ).order_by(desc(Media.captured_at)).all()
    
    return [{
        "id": item.id,
        "filename": item.filename,
        "captured_at": item.captured_at,
        "file_size": item.file_size,
        "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
    } for item in items]

@router.get("/large-files")
def get_large_storage_files(min_mb: float = 3.0, limit: int = 50, db: Session = Depends(get_db)):
    """Lists the largest files in the library to identify storage hogs."""
    min_bytes = int(min_mb * 1024 * 1024)
    items = db.query(Media).filter(
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
        "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
    } for item in items]

@router.post("/move-to-memories")
def move_to_memories(req: BatchActionRequest, db: Session = Depends(get_db)):
    """Reclassifies selected items as permanent memories, removing them from triage trays."""
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids)
    ).update({
        "category": MediaCategory.MEMORY,
        "expires_at": None
    }, synchronize_session=False)
    db.commit()
    return {"status": "moved_to_memories", "count": updated}

@router.post("/mark-sharp")
def mark_as_sharp(req: BatchActionRequest, db: Session = Depends(get_db)):
    """Marks selected photos as not blurry (dismisses blur flag)."""
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids)
    ).update({"is_blurry": False}, synchronize_session=False)
    db.commit()
    return {"status": "marked_sharp", "count": updated}

@router.post("/resolve-all-duplicates")
def resolve_all_duplicates(db: Session = Depends(get_db)):
    """
    Auto-resolves all duplicate clusters by keeping the highest resolution/sharpness image
    in each cluster and soft-deleting redundant copies.
    """
    duplicate_hashes = db.query(Media.perceptual_hash).filter(
        Media.perceptual_hash != None,
        Media.is_deleted == False
    ).group_by(Media.perceptual_hash).having(func.count(Media.id) > 1).all()

    total_deleted = 0
    resolved_clusters = 0

    for (h,) in duplicate_hashes:
        items = db.query(Media).filter(
            Media.perceptual_hash == h,
            Media.is_deleted == False
        ).all()

        if len(items) <= 1:
            continue

        # Score items: higher resolution (w*h) + file_size + blurriness_score
        def item_quality(m):
            res = (m.width or 1000) * (m.height or 1000)
            size = m.file_size or 0
            sharpness = m.blurriness_score or 0
            return (res, size, sharpness)

        sorted_items = sorted(items, key=item_quality, reverse=True)
        best_item = sorted_items[0]
        redundant_items = sorted_items[1:]

        redundant_ids = [m.id for m in redundant_items]
        deleted_count = db.query(Media).filter(
            Media.id.in_(redundant_ids)
        ).update({"is_deleted": True}, synchronize_session=False)

        total_deleted += deleted_count
        resolved_clusters += 1

    db.commit()
    return {
        "status": "all_resolved",
        "clusters_resolved": resolved_clusters,
        "deleted_duplicates": total_deleted
    }

