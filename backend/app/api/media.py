import os
import io
import zipfile
import shutil
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse, RedirectResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.models.media import Media, MediaCategory, SourceType
from app.services.scanner import scan_file, extract_exif, reverse_geocode
from app.services.settings_service import get_storage_mode, get_setting
from app.services.drive_cache import get_google_drive_thumbnail_url, stream_google_drive_file, fetch_google_drive_thumbnail_bytes
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
            "blurriness_score": item.blurriness_score,
            "file_size": item.file_size,
            "camera_make": item.camera_make,
            "camera_model": item.camera_model,
            "iso": item.iso,
            "focal_length": item.focal_length,
            "exposure_time": item.exposure_time,
            "latitude": item.latitude,
            "longitude": item.longitude,
            "location_name": item.location_name,
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
    size: str = Query("256", regex="^(256|512|1080|2048|original)$"),
    db: Session = Depends(get_db)
):
    """Serves high-performance WebP thumbnail or full uncompressed original."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    storage_mode = get_storage_mode(db)
    use_google_cdn = get_setting(db, "use_google_cdn_thumbnails", "true").lower() in ("true", "1", "yes")

    # 1. Google Drive In-Memory / CDN Serving (9drive architecture: zero local disk usage)
    if media.source_type == SourceType.GOOGLE_DRIVE and media.source_id and (use_google_cdn or storage_mode == "in_memory"):
        size_int = 2048 if size == "original" else int(size)
        
        # Server-side proxy with in-memory caching: guarantees NO 429 Referer block from Google
        thumb_bytes = fetch_google_drive_thumbnail_bytes(media.source_id, db, size_int)
        if thumb_bytes:
            return Response(
                content=thumb_bytes,
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "X-Thumbnail-Source": "google_cdn_proxy"
                }
            )
            
        # Secondary fallback: redirect with strict no-referrer policy if byte fetching was unavailable
        cdn_url = get_google_drive_thumbnail_url(media.source_id, db, size_int)
        if cdn_url:
            return RedirectResponse(
                cdn_url,
                status_code=307,
                headers={"Referrer-Policy": "no-referrer"}
            )

    # 2. Local Disk Thumbnail Serving (if cached/saved)
    if size == "original":
        if media.original_path and os.path.isfile(media.original_path):
            return FileResponse(
                media.original_path,
                media_type=media.mime_type or "image/jpeg",
                headers={"Content-Disposition": "inline"}
            )
            
    thumb_path = media.thumbnail_256_path if size in ("256", "512") else media.thumbnail_1080_path
    if thumb_path and os.path.isfile(thumb_path):
        return FileResponse(thumb_path, media_type="image/webp")
        
    if media.original_path and os.path.isfile(media.original_path):
        return FileResponse(media.original_path, media_type=media.mime_type or "image/jpeg")

    # 3. In-memory stream fallback from Google Drive
    if media.source_type == SourceType.GOOGLE_DRIVE and media.source_id:
        try:
            return StreamingResponse(
                stream_google_drive_file(media.source_id, db),
                media_type=media.mime_type or "image/jpeg"
            )
        except Exception:
            pass

    # 4. In-memory stream from MinIO / S3 Object Storage
    if media.source_type == SourceType.S3_MINIO and media.thumbnail_256_path:
        try:
            from app.services.s3_storage import stream_s3_file
            target_key = media.source_id if size == "original" else media.thumbnail_256_path
            return StreamingResponse(
                stream_s3_file(target_key),
                media_type="image/jpeg" if size == "original" else "image/webp"
            )
        except Exception:
            pass
    raise HTTPException(status_code=404, detail="Thumbnail or image not found on disk")

@router.get("/{media_id}/keyframe/{keyframe_id}/thumbnail")
def get_keyframe_thumbnail(media_id: int, keyframe_id: int, db: Session = Depends(get_db)):
    """Serves WebP preview thumbnail for a video keyframe."""
    from app.models.media import VideoKeyframe
    kf = db.query(VideoKeyframe).filter(VideoKeyframe.id == keyframe_id, VideoKeyframe.media_id == media_id).first()
    if not kf or not kf.thumbnail_path or not os.path.isfile(kf.thumbnail_path):
        raise HTTPException(status_code=404, detail="Keyframe thumbnail not found")
    return FileResponse(
        kf.thumbnail_path,
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=86400"}
    )

@router.get("/{media_id}/view")
def view_original(media_id: int, db: Session = Depends(get_db)):
    """Streams full uncompressed original photo directly for pixel-perfect zoom inspection."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    storage_mode = get_storage_mode(db)

    # In-memory streaming from Google Drive if in_memory mode or file not on disk
    if media.source_type == SourceType.GOOGLE_DRIVE and media.source_id and (storage_mode == "in_memory" or not media.original_path or not os.path.isfile(media.original_path)):
        try:
            return StreamingResponse(
                stream_google_drive_file(media.source_id, db),
                media_type=media.mime_type or "image/jpeg",
                headers={"Content-Disposition": "inline"}
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"In-memory stream error: {e}")

    # Streaming from MinIO / S3 Object Storage
    if media.source_type == SourceType.S3_MINIO and media.source_id:
        try:
            from app.services.s3_storage import stream_s3_file
            return StreamingResponse(
                stream_s3_file(media.source_id),
                media_type=media.mime_type or "image/jpeg",
                headers={"Content-Disposition": "inline"}
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"S3 stream error: {e}")

    if media.original_path and os.path.isfile(media.original_path):
        return FileResponse(
            media.original_path,
            media_type=media.mime_type or "image/jpeg",
            headers={"Content-Disposition": "inline"}
        )

    raise HTTPException(status_code=404, detail="Original image not found")

@router.post("/regenerate-thumbnails")
def regenerate_all_thumbnails(db: Session = Depends(get_db)):
    """Regenerates all thumbnails with high-DPI 512px and 2560px ultra-HD tiers."""
    from app.services.thumbnail import generate_thumbnails
    photos = db.query(Media).filter(Media.is_deleted == False).all()
    updated = 0
    for p in photos:
        if p.original_path and os.path.isfile(p.original_path):
            try:
                res = generate_thumbnails(p.original_path, p.id)
                p.thumbnail_256_path = res["thumbnail_256_path"]
                p.thumbnail_1080_path = res["thumbnail_1080_path"]
                p.blurriness_score = res["blurriness_score"]
                p.is_blurry = res["is_blurry"]
                updated += 1
            except Exception:
                pass
    db.commit()
    return {"status": "completed", "updated_photos": updated}

@router.get("/{media_id}/download")
def download_original(media_id: int, db: Session = Depends(get_db)):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    storage_mode = get_storage_mode(db)

    # In-memory streaming download from Google Drive if in_memory mode or file not on disk
    if media.source_type == SourceType.GOOGLE_DRIVE and media.source_id and (storage_mode == "in_memory" or not media.original_path or not os.path.isfile(media.original_path)):
        try:
            return StreamingResponse(
                stream_google_drive_file(media.source_id, db),
                media_type=media.mime_type or "application/octet-stream",
                headers={"Content-Disposition": f'attachment; filename="{media.filename}"'}
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"In-memory download error: {e}")

    if media.original_path and os.path.isfile(media.original_path):
        return FileResponse(
            media.original_path,
            media_type=media.mime_type or "application/octet-stream",
            filename=media.filename
        )

    raise HTTPException(status_code=404, detail="Original file not found")

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

class SingleCategoryUpdate(BaseModel):
    category: MediaCategory

@router.patch("/{media_id}/category")
def update_media_category(media_id: int, req: SingleCategoryUpdate, db: Session = Depends(get_db)):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    media.category = req.category
    db.commit()
    return {"id": media.id, "category": media.category}

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
            base_name = item.filename or (os.path.basename(item.original_path) if item.original_path else f"photo_{item.id}.jpg")
            arc_name = base_name
            counter = 1
            while arc_name in seen_filenames:
                name_part, ext_part = os.path.splitext(base_name)
                arc_name = f"{name_part}_{counter}{ext_part}"
                counter += 1
            seen_filenames.add(arc_name)

            if item.original_path and os.path.isfile(item.original_path):
                zip_file.write(item.original_path, arcname=arc_name)
            elif item.source_type == SourceType.GOOGLE_DRIVE and item.source_id:
                try:
                    content = b"".join(stream_google_drive_file(item.source_id, db))
                    zip_file.writestr(arc_name, content)
                except Exception as e:
                    logger.error(f"Error streaming {item.id} into zip: {e}")
            elif item.source_type == SourceType.S3_MINIO and item.source_id:
                try:
                    from app.services.s3_storage import get_s3_bytes
                    content = get_s3_bytes(item.source_id)
                    zip_file.writestr(arc_name, content)
                except Exception as e:
                    logger.error(f"Error reading S3 item {item.id} into zip: {e}")
                
    zip_buffer.seek(0)
    filename = f"mymemorypics_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

class LocationUpdateRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None

@router.patch("/{media_id}/location")
def update_media_location(media_id: int, req: LocationUpdateRequest, db: Session = Depends(get_db)):
    """Update location coordinates and/or place name for a single photo."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
        
    media.latitude = req.latitude
    media.longitude = req.longitude
    
    if req.location_name:
        media.location_name = req.location_name
    elif req.latitude is not None and req.longitude is not None:
        media.location_name = reverse_geocode(req.latitude, req.longitude)
    else:
        media.location_name = None
        
    db.commit()
    db.refresh(media)
    return {
        "id": media.id,
        "latitude": media.latitude,
        "longitude": media.longitude,
        "location_name": media.location_name
    }

class BatchLocationRequest(BaseModel):
    media_ids: List[int]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None

@router.patch("/batch-location")
def batch_update_location(req: BatchLocationRequest, db: Session = Depends(get_db)):
    """Bulk assigns location coordinates and/or place name to selected photos."""
    loc_name = req.location_name
    if not loc_name and req.latitude is not None and req.longitude is not None:
        loc_name = reverse_geocode(req.latitude, req.longitude)
        
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids)
    ).update({
        "latitude": req.latitude,
        "longitude": req.longitude,
        "location_name": loc_name
    }, synchronize_session=False)
    db.commit()
    return {
        "status": "success",
        "count": updated,
        "latitude": req.latitude,
        "longitude": req.longitude,
        "location_name": loc_name
    }

class PropagateLocationsRequest(BaseModel):
    max_gap_hours: float = 4.0

@router.post("/propagate-locations")
def propagate_cluster_locations(req: PropagateLocationsRequest = PropagateLocationsRequest(), db: Session = Depends(get_db)):
    """
    Intelligently propagates location from GPS anchor photos to nearby non-geotagged photos
    taken within max_gap_hours of the same outing or event.
    """
    anchors = db.query(Media).filter(
        Media.latitude != None,
        Media.longitude != None,
        Media.captured_at != None,
        Media.is_deleted == False
    ).all()
    
    if not anchors:
        return {"status": "skipped", "message": "No geotagged anchor photos found in library", "updated_count": 0}
        
    non_geo = db.query(Media).filter(
        Media.latitude == None,
        Media.captured_at != None,
        Media.is_deleted == False
    ).all()
    
    updated_count = 0
    for item in non_geo:
        best_anchor = None
        min_gap_seconds = req.max_gap_hours * 3600.0
        for anc in anchors:
            gap = abs((item.captured_at - anc.captured_at).total_seconds())
            if gap <= min_gap_seconds:
                min_gap_seconds = gap
                best_anchor = anc
                
        if best_anchor:
            item.latitude = best_anchor.latitude
            item.longitude = best_anchor.longitude
            item.location_name = best_anchor.location_name
            updated_count += 1
            
    db.commit()
    return {
        "status": "success",
        "updated_count": updated_count,
        "anchor_count": len(anchors)
    }

@router.post("/rescan-geotags")
def rescan_all_geotags(db: Session = Depends(get_db)):
    """
    Deep-scans all photos in library for embedded/concatenated JPEGs with GPS EXIF,
    re-extracting coordinates and place names.
    """
    from PIL import Image
    photos = db.query(Media).filter(Media.is_deleted == False).all()
    updated_photos = []
    
    for p in photos:
        if not p.original_path or not os.path.isfile(p.original_path):
            continue
        try:
            with Image.open(p.original_path) as img:
                exif = extract_exif(img, file_path=p.original_path)
                if exif.get("latitude") is not None and exif.get("longitude") is not None:
                    p.latitude = exif["latitude"]
                    p.longitude = exif["longitude"]
                    p.location_name = exif.get("location_name")
                if exif.get("camera_make"):
                    p.camera_make = exif["camera_make"]
                if exif.get("camera_model"):
                    p.camera_model = exif["camera_model"]
                if exif.get("iso"):
                    p.iso = exif["iso"]
                if exif.get("focal_length"):
                    p.focal_length = exif["focal_length"]
                if exif.get("exposure_time"):
                    p.exposure_time = exif["exposure_time"]
                updated_photos.append({
                    "id": p.id,
                    "filename": p.filename,
                    "latitude": p.latitude,
                    "longitude": p.longitude,
                    "location_name": p.location_name
                })
        except Exception:
            pass
            
    db.commit()
    return {
        "status": "success",
        "total_scanned": len(photos),
        "geotagged_found": len([p for p in updated_photos if p["latitude"] is not None]),
        "items": [p for p in updated_photos if p["latitude"] is not None]
    }
