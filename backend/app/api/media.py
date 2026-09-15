import os
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.models.media import Media, MediaCategory, SourceType
from app.services.scanner import scan_file
from app.config import settings

router = APIRouter()

@router.get("")
def list_media(
    category: Optional[MediaCategory] = None,
    is_favorite: Optional[bool] = None,
    is_archived: bool = False,
    is_deleted: bool = False,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """List photos with filtering and pagination."""
    query = db.query(Media).filter(
        Media.is_archived == is_archived,
        Media.is_deleted == is_deleted
    )
    if category:
        query = query.filter(Media.category == category)
    if is_favorite is not None:
        query = query.filter(Media.is_favorite == is_favorite)
        
    total = query.count()
    items = query.order_by(desc(Media.captured_at)).offset(offset).limit(limit).all()
    
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": items
    }

@router.get("/timeline")
def get_timeline(
    category: Optional[MediaCategory] = None,
    db: Session = Depends(get_db)
):
    """
    Returns media items grouped chronologically by Day (YYYY-MM-DD),
    perfect for Google Photos-style infinite timeline scrolling.
    """
    query = db.query(Media).filter(
        Media.is_archived == False,
        Media.is_deleted == False
    )
    if category:
        query = query.filter(Media.category == category)
        
    items = query.order_by(desc(Media.captured_at)).all()
    
    # Group by Day string
    timeline_groups = {}
    for item in items:
        day_key = item.captured_at.strftime("%Y-%m-%d") if item.captured_at else "Unknown Date"
        if day_key not in timeline_groups:
            timeline_groups[day_key] = {
                "date": day_key,
                "count": 0,
                "items": []
            }
        timeline_groups[day_key]["count"] += 1
        timeline_groups[day_key]["items"].append({
            "id": item.id,
            "filename": item.filename,
            "category": item.category,
            "width": item.width,
            "height": item.height,
            "captured_at": item.captured_at,
            "is_favorite": item.is_favorite,
            "is_blurry": item.is_blurry,
            "expires_at": item.expires_at,
            "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
        })
        
    return list(timeline_groups.values())

@router.get("/{media_id}")
def get_media_detail(media_id: int, db: Session = Depends(get_db)):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    return media

@router.get("/{media_id}/thumbnail")
def get_thumbnail(
    media_id: int,
    size: str = Query("256", regex="^(256|1080)$"),
    db: Session = Depends(get_db)
):
    """Serves high-performance WebP thumbnail."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
        
    thumb_path = media.thumbnail_256_path if size == "256" else media.thumbnail_1080_path
    if thumb_path and os.path.isfile(thumb_path):
        return FileResponse(thumb_path, media_type="image/webp")
        
    if media.original_path and os.path.isfile(media.original_path):
        return FileResponse(media.original_path, media_type=media.mime_type or "image/jpeg")
        
    raise HTTPException(status_code=404, detail="Thumbnail or image not found on disk")

@router.get("/{media_id}/download")
def download_original(media_id: int, db: Session = Depends(get_db)):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media or not os.path.isfile(media.original_path):
        raise HTTPException(status_code=404, detail="Original file not found")
    return FileResponse(
        media.original_path,
        media_type=media.mime_type or "application/octet-stream",
        filename=media.filename
    )

@router.post("/upload")
def upload_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Directly uploads a photo into the library and triggers ingestion."""
    upload_dir = os.path.join(settings.MEDIA_DIR, "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    dest_filename = f"{timestamp}_{file.filename}"
    dest_path = os.path.join(upload_dir, dest_filename)
    
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    media = scan_file(db, dest_path, SourceType.MANUAL_UPLOAD)
    if not media:
        raise HTTPException(status_code=400, detail="Uploaded file is not a supported image")
        
    return {
        "status": "success",
        "id": media.id,
        "category": media.category,
        "filename": media.filename
    }

@router.patch("/{media_id}/favorite")
def toggle_favorite(media_id: int, db: Session = Depends(get_db)):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    media.is_favorite = not media.is_favorite
    db.commit()
    return {"id": media.id, "is_favorite": media.is_favorite}

@router.patch("/{media_id}/archive")
def toggle_archive(media_id: int, db: Session = Depends(get_db)):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    media.is_archived = not media.is_archived
    db.commit()
    return {"id": media.id, "is_archived": media.is_archived}

@router.delete("/{media_id}")
def delete_media(media_id: int, permanent: bool = False, db: Session = Depends(get_db)):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
        
    if permanent:
        if media.original_path and os.path.isfile(media.original_path):
            try:
                os.remove(media.original_path)
            except Exception:
                pass
        db.delete(media)
    else:
        media.is_deleted = True
        
    db.commit()
    return {"status": "deleted", "id": media_id, "permanent": permanent}
