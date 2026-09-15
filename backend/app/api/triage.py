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
                "captured_at": m.captured_at,
                "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256"
            } for m in items]
        })
        
    return clusters

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
