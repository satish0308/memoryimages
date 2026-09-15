import os
import io
import zipfile
import shutil
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
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
    scale: str = Query("day", regex="^(day|month|year)$"),
    db: Session = Depends(get_db)
):
    """
    Returns media items grouped chronologically by Day, Month, or Year,
    enabling pinch-to-zoom timeline scaling and bulk selection.
    """
    query = db.query(Media).filter(
        Media.is_archived == False,
        Media.is_deleted == False
    )
    if category:
        query = query.filter(Media.category == category)
        
    items = query.order_by(desc(Media.captured_at)).all()
    
    # Group based on requested scale
    timeline_groups = {}
    for item in items:
        if not item.captured_at:
            group_key = "Unknown Date"
            label = "Unknown Date"
        elif scale == "year":
            group_key = item.captured_at.strftime("%Y")
            label = group_key
        elif scale == "month":
            group_key = item.captured_at.strftime("%Y-%m")
            label = item.captured_at.strftime("%B %Y")
        else: # day
            group_key = item.captured_at.strftime("%Y-%m-%d")
            label = item.captured_at.strftime("%B %d, %Y")

        if group_key not in timeline_groups:
            timeline_groups[group_key] = {
                "key": group_key,
                "date": label,
                "scale": scale,
                "count": 0,
                "items": []
            }
        timeline_groups[group_key]["count"] += 1
        timeline_groups[group_key]["items"].append({
            "id": item.id,
            "filename": item.filename,
            "category": item.category,
            "width": item.width,
            "height": item.height,
            "captured_at": item.captured_at,
            "is_favorite": item.is_favorite,
            "is_blurry": item.is_blurry,
            "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
        })
        
    return list(timeline_groups.values())

@router.get("/flashbacks")
def get_flashbacks(db: Session = Depends(get_db)):
    """
    Returns 'On This Day' memories taken on today's calendar date in previous years.
    """
    now = datetime.utcnow()
    target_md = now.strftime("%m-%d")
    current_year = str(now.year)
    
    # Query photos from this day/month in prior years
    items = db.query(Media).filter(
        func.strftime("%m-%d", Media.captured_at) == target_md,
        func.strftime("%Y", Media.captured_at) < current_year,
        Media.is_deleted == False,
        Media.is_archived == False
    ).order_by(desc(Media.captured_at)).all()

    # Group by Year
    flashback_groups = {}
    for item in items:
        year = str(item.captured_at.year)
        years_ago = now.year - item.captured_at.year
        label = f"{years_ago} Year{'s' if years_ago > 1 else ''} Ago ({year})"
        
        if label not in flashback_groups:
            flashback_groups[label] = {
                "label": label,
                "year": year,
                "count": 0,
                "items": []
            }
        flashback_groups[label]["count"] += 1
        flashback_groups[label]["items"].append({
            "id": item.id,
            "filename": item.filename,
            "category": item.category,
            "captured_at": item.captured_at,
            "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256"
        })

    return list(flashback_groups.values())

@router.get("/locations")
def get_locations(db: Session = Depends(get_db)):
    """
    Returns all geotagged photos grouped for interactive map exploration.
    """
    items = db.query(Media).filter(
        Media.latitude != None,
        Media.longitude != None,
        Media.is_deleted == False
    ).all()

    return [{
        "id": m.id,
        "filename": m.filename,
        "latitude": m.latitude,
        "longitude": m.longitude,
        "location_name": m.location_name,
        "captured_at": m.captured_at,
        "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256"
    } for m in items]

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

class BatchFavoriteRequest(BaseModel):
    media_ids: List[int]
    is_favorite: bool = True

@router.patch("/batch-favorite")
def batch_favorite(req: BatchFavoriteRequest, db: Session = Depends(get_db)):
    """Bulk favorites or un-favorites selected media items."""
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids)
    ).update({"is_favorite": req.is_favorite}, synchronize_session=False)
    db.commit()
    return {"status": "success", "count": updated, "is_favorite": req.is_favorite}

class BatchCategoryRequest(BaseModel):
    media_ids: List[int]
    category: MediaCategory

@router.patch("/batch-category")
def batch_category(req: BatchCategoryRequest, db: Session = Depends(get_db)):
    """Bulk updates category for selected media items (e.g. reorganize to memories, bills, etc.)."""
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids)
    ).update({"category": req.category}, synchronize_session=False)
    db.commit()
    return {"status": "success", "count": updated, "category": req.category}

class BatchDeleteRequest(BaseModel):
    media_ids: List[int]
    permanent: bool = False

@router.post("/batch-delete")
def batch_delete_media(req: BatchDeleteRequest, db: Session = Depends(get_db)):
    """Soft deletes or permanently deletes selected media items. Strictly safe zero auto-deletion."""
    if req.permanent:
        items = db.query(Media).filter(Media.id.in_(req.media_ids)).all()
        for item in items:
            if item.original_path and os.path.isfile(item.original_path):
                try:
                    os.remove(item.original_path)
                except Exception:
                    pass
            db.delete(item)
        db.commit()
        return {"status": "success", "count": len(items), "permanent": True}
    else:
        updated = db.query(Media).filter(
            Media.id.in_(req.media_ids)
        ).update({"is_deleted": True}, synchronize_session=False)
        db.commit()
        return {"status": "success", "count": updated, "permanent": False}

class BulkDownloadRequest(BaseModel):
    media_ids: List[int]

@router.post("/bulk-download")
def bulk_download(req: BulkDownloadRequest, db: Session = Depends(get_db)):
    """
    Creates and streams a ZIP file archive of selected photos for bulk copying/exporting.
    """
    items = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.is_deleted == False
    ).all()
    
    if not items:
        raise HTTPException(status_code=404, detail="No media files found to download")
        
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        seen_filenames = set()
        for item in items:
            if item.original_path and os.path.isfile(item.original_path):
                base_name = os.path.basename(item.original_path)
                arc_name = base_name
                counter = 1
                while arc_name in seen_filenames:
                    name_part, ext_part = os.path.splitext(base_name)
                    arc_name = f"{name_part}_{counter}{ext_part}"
                    counter += 1
                seen_filenames.add(arc_name)
                zip_file.write(item.original_path, arcname=arc_name)
                
    zip_buffer.seek(0)
    filename = f"mymemorypics_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
