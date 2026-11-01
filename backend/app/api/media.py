import os
import io
import json
import zipfile
import shutil
import logging
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import FileResponse, StreamingResponse, RedirectResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, extract

from app.database import get_db
from app.models.user import User
from app.models.media import Media, MediaCategory, SourceType
from app.api.auth import get_current_user, get_optional_current_user
from app.services.scanner import scan_file, extract_exif, reverse_geocode
from app.services.settings_service import get_storage_mode, get_setting
from app.services.drive_cache import get_google_drive_thumbnail_url, stream_google_drive_file, fetch_google_drive_thumbnail_bytes
from app.services.google_sync import delete_file_from_google_drive
from app.config import settings

logger = logging.getLogger("memorypics.api.media")
router = APIRouter()

def _format_media_item(item, burst_count=1, burst_id=None, burst_media_ids=None, is_burst_lead=False, burst_score=None, burst_type=None):
    return {
        "id": item.id,
        "filename": item.filename,
        "category": item.category.value if hasattr(item.category, "value") else str(item.category),
        "captured_at": item.captured_at.isoformat() if item.captured_at else None,
        "width": item.width or 0,
        "height": item.height or 0,
        "is_favorite": bool(item.is_favorite),
        "is_blurry": bool(item.is_blurry),
        "blur_type": getattr(item, "blur_type", "sharp") or "sharp",
        "is_bokeh": getattr(item, "is_bokeh", False) or False,
        "is_enhanced": getattr(item, "is_enhanced", False) or False,
        "enhancement_data": item.enhancement_data,
        "file_size": item.file_size,
        "camera_make": item.camera_make,
        "camera_model": item.camera_model,
        "iso": item.iso,
        "focal_length": item.focal_length,
        "exposure_time": item.exposure_time,
        "latitude": item.latitude,
        "longitude": item.longitude,
        "location_name": item.location_name,
        "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256",
        "mood": item.mood,
        "mood_score": item.mood_score,
        "is_smiling": item.is_smiling,
        "dominant_color": item.dominant_color,
        "color_hex": item.color_hex,
        "is_video": (item.mime_type or "").startswith("video/"),
        "duration_seconds": item.duration_seconds,
        "has_motion_photo": bool(getattr(item, "has_motion_photo", False)),
        "motion_video_url": f"/api/v1/media/{item.id}/motion-video" if getattr(item, "has_motion_photo", False) else None,
        "source_type": (item.source_type.value if hasattr(item.source_type, "value") else str(item.source_type)) if item.source_type else "local",
        "source_id": item.source_id,
        "burst_count": burst_count,
        "burst_id": burst_id,
        "burst_media_ids": burst_media_ids or [],
        "is_burst_lead": is_burst_lead,
        "burst_score": burst_score,
        "burst_type": burst_type,
    }

@router.get("")
def list_media(
    category: Optional[MediaCategory] = None,
    is_favorite: Optional[bool] = None,
    is_archived: bool = False,
    is_deleted: bool = False,
    geotagged_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """List photos strictly scoped to the authenticated user's account."""
    if not current_user:
        return {
            "total": 0,
            "offset": offset,
            "limit": limit,
            "items": []
        }

    query = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.is_archived == is_archived,
        Media.is_deleted == is_deleted
    )
    if category:
        query = query.filter(Media.category == category)
    if is_favorite is not None:
        query = query.filter(Media.is_favorite == is_favorite)
    if geotagged_only:
        query = query.filter(Media.latitude != None, Media.longitude != None)
        
    total = query.count()
    items = query.order_by(desc(Media.captured_at)).offset(offset).limit(limit).all()
    
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [_format_media_item(item) for item in items]
    }

@router.get("/timeline")
def get_timeline(
    category: Optional[MediaCategory] = None,
    scale: str = Query("day", regex="^(day|month|year)$"),
    collapse_bursts: bool = Query(True),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns media items grouped chronologically strictly for the authenticated user.
    Guests receive an empty list with zero photo/metadata leakage.
    """
    if not current_user:
        return []

    from app.services.burst_engine import detect_burst_clusters

    query = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.is_archived == False,
        Media.is_deleted == False
    )
    if category:
        query = query.filter(Media.category == category)
        
    items = query.order_by(desc(Media.captured_at)).all()

    # Pre-calculate burst clusters if collapsing is active
    subordinate_burst_ids = set()
    burst_lead_map = {}
    if collapse_bursts:
        clusters = detect_burst_clusters(db, category=category, user_id=current_user.id)
        for c in clusters:
            best_id = c["best_shot_id"]
            burst_lead_map[best_id] = c
            for it in c["items"]:
                if it["id"] != best_id:
                    subordinate_burst_ids.add(it["id"])
    
    # Group based on requested scale
    timeline_groups = {}
    for item in items:
        # If burst collapse is active and this item is a redundant shot in a burst, skip showing it in main grid
        if collapse_bursts and item.id in subordinate_burst_ids:
            continue

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

        burst_info = burst_lead_map.get(item.id)
        burst_count = burst_info["count"] if burst_info else 1
        burst_id = burst_info["id"] if burst_info else None
        burst_media_ids = [it["id"] for it in burst_info["items"]] if burst_info else []
        is_burst_lead = bool(burst_info)
        burst_score = burst_info["items"][0]["composite_score"] if burst_info else None
        burst_type = burst_info["cluster_type"] if burst_info else None

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
            "blur_type": getattr(item, "blur_type", "sharp") or "sharp",
            "is_bokeh": getattr(item, "is_bokeh", False) or False,
            "is_enhanced": getattr(item, "is_enhanced", False) or False,
            "enhancement_data": item.enhancement_data,
            "file_size": item.file_size,
            "camera_make": item.camera_make,
            "camera_model": item.camera_model,
            "iso": item.iso,
            "focal_length": item.focal_length,
            "exposure_time": item.exposure_time,
            "latitude": item.latitude,
            "longitude": item.longitude,
            "location_name": item.location_name,
            "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256",
            "mood": item.mood,
            "mood_score": item.mood_score,
            "is_smiling": item.is_smiling,
            "dominant_color": item.dominant_color,
            "color_hex": item.color_hex,
            "is_video": (item.mime_type or "").startswith("video/"),
            "duration_seconds": item.duration_seconds,
            "has_motion_photo": bool(getattr(item, "has_motion_photo", False)),
            "motion_video_url": f"/api/v1/media/{item.id}/motion-video" if getattr(item, "has_motion_photo", False) else None,
            "source_type": (item.source_type.value if hasattr(item.source_type, "value") else str(item.source_type)) if item.source_type else "local",
            "source_id": item.source_id,
            "burst_count": burst_count,
            "burst_id": burst_id,
            "burst_media_ids": burst_media_ids,
            "is_burst_lead": is_burst_lead,
            "burst_score": burst_score,
            "burst_type": burst_type
        })
        
    return list(timeline_groups.values())

@router.get("/flashbacks")
def get_flashbacks(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Returns 'On This Day' memories strictly for the current user."""
    if not current_user:
        return []

    now = datetime.utcnow()
    target_md = now.strftime("%m-%d")
    current_year = str(now.year)
    
    items = db.query(Media).filter(
        Media.user_id == current_user.id,
        func.strftime("%m-%d", Media.captured_at) == target_md,
        func.strftime("%Y", Media.captured_at) < current_year,
        Media.is_deleted == False,
        Media.is_archived == False
    ).order_by(desc(Media.captured_at)).all()

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

@router.get("/memories/highlights")
def get_memories_highlights(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns curated, story-style nostalgic memory reels for the current user:
    - On This Day (Past Years)
    - This Week in Past Years
    - Rediscovered Favorites
    - Smiles & Joyful Moments
    - Scenic Travel Flashbacks
    """
    if not current_user:
        return {"reels": []}

    now = datetime.utcnow()
    current_month = now.month
    current_day = now.day
    current_year = now.year

    reels = []

    # 1. On This Day in Past Years (Exact Day match)
    on_this_day_items = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.is_deleted == False,
        Media.is_archived == False,
        extract("month", Media.captured_at) == current_month,
        extract("day", Media.captured_at) == current_day,
        extract("year", Media.captured_at) < current_year
    ).order_by(desc(Media.captured_at)).all()

    if on_this_day_items:
        # Group by year
        year_groups = {}
        for it in on_this_day_items:
            y = it.captured_at.year
            if y not in year_groups:
                year_groups[y] = []
            year_groups[y].append(it)

        for y, items in sorted(year_groups.items(), reverse=True):
            years_ago = current_year - y
            title = f"{years_ago} Year{'s' if years_ago > 1 else ''} Ago Today"
            reels.append({
                "id": f"on_this_day_{y}",
                "tag": "ON THIS DAY",
                "title": title,
                "subtitle": f"{now.strftime('%B %d')}, {y} • {len(items)} memories",
                "cover_url": f"/api/v1/media/{items[0].id}/thumbnail?size=1080",
                "item_count": len(items),
                "items": [_format_media_item(it) for it in items]
            })

    # 2. This Week in Past Years (+/- 4 days from today)
    start_day = max(1, current_day - 4)
    end_day = current_day + 4
    week_items = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.is_deleted == False,
        Media.is_archived == False,
        extract("month", Media.captured_at) == current_month,
        extract("day", Media.captured_at).between(start_day, end_day),
        extract("year", Media.captured_at) < current_year
    ).order_by(desc(Media.captured_at)).limit(40).all()

    if week_items and len(week_items) >= 4:
        reels.append({
            "id": f"this_week_past_{current_month}",
            "tag": "NOSTALGIA",
            "title": f"This Week in {now.strftime('%B')}",
            "subtitle": f"Rediscovering {len(week_items)} moments from past years",
            "cover_url": f"/api/v1/media/{week_items[0].id}/thumbnail?size=1080",
            "item_count": len(week_items),
            "items": [_format_media_item(it) for it in week_items]
        })

    # 3. Smiling & Joyful Memories
    happy_items = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.is_deleted == False,
        Media.is_archived == False,
        (Media.is_smiling == True) | (Media.mood == "joyful") | (Media.mood == "celebratory")
    ).order_by(desc(Media.captured_at)).limit(35).all()

    if happy_items and len(happy_items) >= 3:
        reels.append({
            "id": "joyful_smiles",
            "tag": "SMILES & JOY",
            "title": "Smiles & Joyful Memories",
            "subtitle": f"{len(happy_items)} candid laughing & happy moments",
            "cover_url": f"/api/v1/media/{happy_items[0].id}/thumbnail?size=1080",
            "item_count": len(happy_items),
            "items": [_format_media_item(it) for it in happy_items]
        })

    # 4. Scenic Travel & Locations Flashback
    travel_items = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.is_deleted == False,
        Media.is_archived == False,
        Media.location_name != None
    ).order_by(desc(Media.captured_at)).limit(40).all()

    if travel_items and len(travel_items) >= 4:
        reels.append({
            "id": "travel_recap",
            "tag": "PLACES & TRIPS",
            "title": "Unforgettable Places & Journeys",
            "subtitle": f"Wanderlust across {len(set(t.location_name for t in travel_items))} locations",
            "cover_url": f"/api/v1/media/{travel_items[0].id}/thumbnail?size=1080",
            "item_count": len(travel_items),
            "items": [_format_media_item(it) for it in travel_items]
        })

    # 5. Golden Hour & Dramatic Shots
    scenic_items = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.is_deleted == False,
        Media.is_archived == False,
        (Media.mood == "serene") | (Media.mood == "dramatic") | (Media.mood == "romantic")
    ).order_by(desc(Media.captured_at)).limit(30).all()

    if scenic_items and len(scenic_items) >= 3:
        reels.append({
            "id": "scenic_serene",
            "tag": "ATMOSPHERE",
            "title": "Golden Hour & Serene Views",
            "subtitle": f"{len(scenic_items)} atmospheric scenes captured in time",
            "cover_url": f"/api/v1/media/{scenic_items[0].id}/thumbnail?size=1080",
            "item_count": len(scenic_items),
            "items": [_format_media_item(it) for it in scenic_items]
        })

    return {"reels": reels}

@router.get("/locations")
def get_locations(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Returns geotagged photos strictly for current user's map exploration."""
    if not current_user:
        return []

    items = db.query(Media).filter(
        Media.user_id == current_user.id,
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
def get_media_detail(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    return media

class BatchShareRequest(BaseModel):
    media_ids: List[int]
    name: Optional[str] = None

@router.post("/batch-share")
def batch_share_media(
    req: BatchShareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Instant batch sharing: creates a shareable event collection for selected photos."""
    import secrets
    from app.models.album import Album
    if not req.media_ids:
        raise HTTPException(status_code=400, detail="No photos selected to share")

    photos = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id,
        Media.is_deleted == False
    ).all()

    if not photos:
        raise HTTPException(status_code=404, detail="No matching photos found")

    share_token = secrets.token_urlsafe(16)
    name = req.name or f"Shared Photos ({datetime.utcnow().strftime('%b %d, %Y')})"
    album = Album(
        user_id=current_user.id,
        name=name,
        description=f"Quick shared bundle with {len(photos)} photos.",
        cover_media_id=photos[0].id,
        share_token=share_token,
        is_public=True,
        allow_guest_uploads=False
    )
    album.media.extend(photos)
    db.add(album)
    db.commit()
    db.refresh(album)

    return {
        "id": album.id,
        "album_id": album.id,
        "name": album.name,
        "share_token": album.share_token,
        "share_url": f"/share/{album.share_token}",
        "photo_count": len(photos)
    }

@router.post("/{media_id}/share")
def share_single_media(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generates a public signed share link for a single photo."""
    import secrets
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    if not media.share_token:
        media.share_token = secrets.token_urlsafe(16)
        db.commit()
        db.refresh(media)

    return {
        "share_token": media.share_token,
        "share_url": f"/share/photo/{media.share_token}",
        "media_id": media.id,
        "filename": media.filename
    }

@router.delete("/{media_id}/share")
def revoke_single_media_share(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revokes the public share link for a single photo."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    media.share_token = None
    db.commit()
    return {"status": "share_revoked"}

@router.get("/public/share/{share_token}")
def get_public_shared_media(
    share_token: str,
    db: Session = Depends(get_db)
):
    """Public guest endpoint: view a single shared photo without login."""
    media = db.query(Media).filter(Media.share_token == share_token).first()
    if not media or media.is_deleted:
        raise HTTPException(status_code=404, detail="Shared photo not found or link has expired")

    return {
        "id": media.id,
        "filename": media.filename,
        "captured_at": media.captured_at.isoformat() if media.captured_at else None,
        "location_name": media.location_name,
        "camera_make": media.camera_make,
        "camera_model": media.camera_model,
        "iso": media.iso,
        "exposure_time": media.exposure_time,
        "focal_length": media.focal_length,
        "width": media.width,
        "height": media.height,
        "has_motion_photo": bool(getattr(media, "has_motion_photo", False)),
        "thumbnail_url": f"/api/v1/media/{media.id}/thumbnail?size=1080",
        "download_url": f"/api/v1/media/{media.id}/view"
    }

@router.get("/{media_id}/burst")
def get_media_burst(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns burst sequence containing this media item for authorized owner."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.burst_engine import get_burst_for_media
    cluster = get_burst_for_media(db, media_id, user_id=current_user.id)
    if not cluster:
        raise HTTPException(status_code=404, detail="No burst sequence found for this photo")
    return cluster

@router.get("/{media_id}/similar")
def get_similar_media(
    media_id: int,
    facet: str = Query("all", regex="^(all|visual|people|location|time)$"),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Finds photos similar to the target media across 4 AI dimensions:
    visual graphics/CLIP, same people/faces, nearby GPS locations, and same outings.
    """
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.similarity_engine import find_similar_photos
    similar_data = find_similar_photos(db, media_id=media_id, user_id=current_user.id, facet=facet, limit=limit)
    if not similar_data:
        raise HTTPException(status_code=404, detail="Could not compute similarity for this photo")
    return similar_data

@router.get("/{media_id}/thumbnail")
def get_thumbnail(
    media_id: int,
    size: str = Query("256", regex="^(256|512|1080|2048|original)$"),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Serves WebP thumbnail or full image strictly to authorized user or admin."""
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required to view media thumbnail")

    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    storage_mode = get_storage_mode(db)
    use_google_cdn = get_setting(db, "use_google_cdn_thumbnails", "true").lower() in ("true", "1", "yes")

    # 1. Google Drive In-Memory / CDN Serving
    if media.source_type == SourceType.GOOGLE_DRIVE and media.source_id and (use_google_cdn or storage_mode == "in_memory"):
        size_int = 2048 if size == "original" else int(size)
        thumb_bytes = fetch_google_drive_thumbnail_bytes(media.source_id, db, size_int)
        if thumb_bytes:
            return Response(
                content=thumb_bytes,
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "private, max-age=86400",
                    "X-Thumbnail-Source": "google_cdn_proxy"
                }
            )
        cdn_url = get_google_drive_thumbnail_url(media.source_id, db, size_int)
        if cdn_url:
            return RedirectResponse(cdn_url, status_code=307, headers={"Referrer-Policy": "no-referrer"})

    # 2. Local Disk Thumbnail Serving
    if size == "original":
        if media.original_path and os.path.isfile(media.original_path):
            return FileResponse(media.original_path, media_type=media.mime_type or "image/jpeg", headers={"Content-Disposition": "inline"})
            
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

    raise HTTPException(status_code=404, detail="Thumbnail or image not found on storage")

@router.get("/{media_id}/motion-video")
def get_motion_video(
    media_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Streams the micro-video clip for Google Motion Photos, Samsung Motion Photos, or paired Apple Live Photos.
    """
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # 1. Local file extraction or paired video (.mov, .mp4)
    if media.original_path and os.path.isfile(media.original_path):
        base, _ = os.path.splitext(media.original_path)
        for ext in [".mov", ".MOV", ".mp4", ".MP4"]:
            paired = base + ext
            if os.path.isfile(paired):
                return FileResponse(paired, media_type="video/mp4", headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400"})

        try:
            with open(media.original_path, "rb") as f:
                content = f.read()
                ftyp_idx = content.find(b"ftyp")
                if ftyp_idx >= 4:
                    box_start = ftyp_idx - 4
                    box_size = int.from_bytes(content[box_start:ftyp_idx], byteorder="big")
                    if 16 <= box_size <= 64:
                        mp4_data = content[box_start:]
                        if len(mp4_data) > 1000:
                            return Response(content=mp4_data, media_type="video/mp4", headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400"})
        except Exception:
            pass

    # 2. Google Drive streaming
    if media.source_type == SourceType.GOOGLE_DRIVE and media.source_id:
        try:
            from app.services.drive_cache import download_drive_file_to_memory
            buf = download_drive_file_to_memory(media.source_id, db)
            if buf:
                content = buf.getvalue()
                ftyp_idx = content.find(b"ftyp")
                if ftyp_idx >= 4:
                    box_start = ftyp_idx - 4
                    box_size = int.from_bytes(content[box_start:ftyp_idx], byteorder="big")
                    if 16 <= box_size <= 64:
                        mp4_data = content[box_start:]
                        if len(mp4_data) > 1000:
                            return Response(content=mp4_data, media_type="video/mp4", headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400"})
        except Exception:
            pass

    raise HTTPException(status_code=404, detail="No motion photo video found for this item")

@router.get("/{media_id}/enhance")
def get_enhanced_image(
    media_id: int,
    preset: str = Query("auto_magic", regex="^(auto_magic|shadow_fix|dehaze|super_res)$"),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Renders an AI-enhanced version of the photo in real-time.
    Supports Auto Magic AI, Shadow Recovery, Vibrant De-Haze, and 2x ESRGAN Super-Resolution.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.enhancement_engine import get_enhanced_image_bytes
    img_bytes = get_enhanced_image_bytes(media, preset=preset, db=db)
    if not img_bytes:
        raise HTTPException(status_code=500, detail="Failed to process image enhancement")

    return Response(
        content=img_bytes,
        media_type="image/webp",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": f"inline; filename=enhanced_{preset}_{media.id}.webp"
        }
    )

@router.post("/{media_id}/enhance/save")
def save_enhanced_image(
    media_id: int,
    preset: str = Query("auto_magic", regex="^(auto_magic|shadow_fix|dehaze|super_res)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Saves the enhanced version into the user's library as a new photo.
    """
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.enhancement_engine import get_enhanced_image_bytes
    img_bytes = get_enhanced_image_bytes(media, preset=preset, db=db, max_preview_dim=2560)
    if not img_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate enhanced image")

    ext = ".webp"
    save_filename = f"enhanced_{preset}_{os.path.splitext(media.filename)[0]}{ext}"
    dest_path = os.path.join(settings.MEDIA_DIR, save_filename)

    with open(dest_path, "wb") as f:
        f.write(img_bytes)

    new_media = Media(
        user_id=current_user.id,
        filename=save_filename,
        original_path=dest_path,
        source_type=SourceType.LOCAL,
        mime_type="image/webp",
        captured_at=media.captured_at,
        is_favorite=media.is_favorite,
        latitude=media.latitude,
        longitude=media.longitude,
        location_name=media.location_name
    )
    db.add(new_media)
    db.commit()
    db.refresh(new_media)

    return {
        "status": "saved",
        "id": new_media.id,
        "filename": new_media.filename,
        "preset": preset
    }

@router.get("/{media_id}/keyframe/{keyframe_id}/thumbnail")
def get_keyframe_thumbnail(
    media_id: int,
    keyframe_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Serves WebP preview thumbnail for a video keyframe for authorized user."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.models.media import VideoKeyframe
    kf = db.query(VideoKeyframe).filter(VideoKeyframe.id == keyframe_id, VideoKeyframe.media_id == media_id).first()
    if not kf or not kf.thumbnail_path or not os.path.isfile(kf.thumbnail_path):
        raise HTTPException(status_code=404, detail="Keyframe thumbnail not found")
    return FileResponse(
        kf.thumbnail_path,
        media_type="image/webp",
        headers={"Cache-Control": "private, max-age=86400"}
    )

@router.get("/{media_id}/view")
def view_original(
    media_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Streams full uncompressed original photo directly for pixel-perfect zoom inspection."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    storage_mode = get_storage_mode(db)

    if media.source_type == SourceType.GOOGLE_DRIVE and media.source_id and (storage_mode == "in_memory" or not media.original_path or not os.path.isfile(media.original_path)):
        try:
            return StreamingResponse(
                stream_google_drive_file(media.source_id, db),
                media_type=media.mime_type or "image/jpeg",
                headers={"Content-Disposition": "inline"}
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"In-memory stream error: {e}")

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
def regenerate_all_thumbnails(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Regenerates thumbnails for the current user."""
    from app.services.thumbnail import generate_thumbnails
    photos = db.query(Media).filter(Media.user_id == current_user.id, Media.is_deleted == False).all()
    updated = 0
    for p in photos:
        if p.original_path and os.path.isfile(p.original_path):
            try:
                res = generate_thumbnails(p.original_path, p.id)
                p.thumbnail_256_path = res["thumbnail_256_path"]
                p.thumbnail_1080_path = res["thumbnail_1080_path"]
                p.blurriness_score = res["blurriness_score"]
                p.is_blurry = res["is_blurry"]
                if "blur_type" in res:
                    p.blur_type = res["blur_type"]
                if "is_bokeh" in res:
                    p.is_bokeh = res["is_bokeh"]
                updated += 1
            except Exception:
                pass
    db.commit()
    return {"status": "completed", "updated_photos": updated}

class EnhanceMediaRequest(BaseModel):
    brightness: Optional[float] = None
    contrast: Optional[float] = None
    saturation: Optional[float] = None
    shadows_lift_pct: Optional[int] = None
    css_filter: Optional[str] = None

class BatchEnhanceRequest(BaseModel):
    media_ids: List[int]
    preset: Optional[str] = "auto_magic"

@router.get("/{media_id}/enhance-params")
def get_media_enhance_params(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Computes optimal auto-enhancement parameters for user photo."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.quality_engine import evaluate_and_update_media_quality, calculate_auto_enhance_params, load_media_image
    image = load_media_image(media, db, prefer_preview=True)
    if image:
        enhance_params = calculate_auto_enhance_params(image)
    else:
        enhance_params = {
            "auto_recommended": True,
            "brightness": 1.12,
            "contrast": 1.10,
            "saturation": 1.08,
            "shadows_lift_pct": 15,
            "css_filter": "brightness(1.12) contrast(1.10) saturate(1.08)"
        }

    return {
        "media_id": media.id,
        "blur_type": getattr(media, "blur_type", "sharp") or "sharp",
        "is_bokeh": getattr(media, "is_bokeh", False) or False,
        "is_blurry": media.is_blurry or False,
        "is_enhanced": getattr(media, "is_enhanced", False) or False,
        "enhance_params": enhance_params,
        "saved_enhancement": json.loads(media.enhancement_data) if media.enhancement_data else None
    }

@router.post("/{media_id}/apply-enhance")
def apply_enhance_to_media(
    media_id: int,
    req: Optional[EnhanceMediaRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Persists non-destructive auto-enhancement recipe to user media."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.quality_engine import apply_media_enhancement
    params = req.dict(exclude_none=True) if req else None
    return apply_media_enhancement(media, db, params)

@router.post("/{media_id}/revert-enhance")
def revert_enhance_media(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reverts user photo to original natural state."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.quality_engine import revert_media_enhancement
    return revert_media_enhancement(media, db)

@router.post("/batch-enhance")
def batch_enhance_media(
    req: BatchEnhanceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Applies auto-enhancement to multiple user media items in batch."""
    from app.services.quality_engine import apply_media_enhancement, revert_media_enhancement
    items = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id
    ).all()
    enhanced_count = 0
    for it in items:
        try:
            if req.preset == "revert":
                revert_media_enhancement(it, db)
            else:
                apply_media_enhancement(it, db, preset=req.preset)
            enhanced_count += 1
        except Exception as e:
            logger.warning(f"Error enhancing media {it.id}: {e}")
    db.commit()
    return {"status": "success", "enhanced_count": enhanced_count, "preset": req.preset}

@router.post("/pregenerate-thumbnails")
def trigger_pregenerate_thumbnails(
    current_user: User = Depends(get_current_user)
):
    """Enqueues a background worker task to pre-generate missing 1080p WebP renditions."""
    from app.services.task_queue import TaskQueue
    task = TaskQueue.enqueue(
        task_type="pregenerate_1080p_renditions",
        payload={"user_id": current_user.id},
        name="Pre-generate 1080p WebP Renditions"
    )
    return {"status": "enqueued", "task": task}

@router.post("/quality/analyze-all")
def run_library_quality_analysis(
    force: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Analyzes user photos to identify bokeh portraits, motion shake, and pocket shots."""
    from app.services.quality_engine import run_library_quality_scan
    return run_library_quality_scan(db, force=force)

@router.get("/{media_id}/download")
def download_original(
    media_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    storage_mode = get_storage_mode(db)

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Directly uploads a photo into user account directory and catalogs with user_id."""
    upload_dir = os.path.join(settings.MEDIA_DIR, "uploads", f"user_{current_user.id}")
    os.makedirs(upload_dir, exist_ok=True)
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    dest_filename = f"{timestamp}_{file.filename}"
    dest_path = os.path.join(upload_dir, dest_filename)
    
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    media = scan_file(db, dest_path, SourceType.MANUAL_UPLOAD, user_id=current_user.id)
    if not media:
        raise HTTPException(status_code=400, detail="Uploaded file is not a supported image")
        
    return {
        "status": "success",
        "id": media.id,
        "user_id": current_user.id,
        "category": media.category,
        "filename": media.filename
    }

@router.patch("/{media_id}/favorite")
def toggle_favorite(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    media.is_favorite = not media.is_favorite
    db.commit()
    return {"id": media.id, "is_favorite": media.is_favorite}

@router.patch("/{media_id}/archive")
def toggle_archive(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    media.is_archived = not media.is_archived
    db.commit()
    return {"id": media.id, "is_archived": media.is_archived}

class SingleCategoryUpdate(BaseModel):
    category: MediaCategory

@router.patch("/{media_id}/category")
def update_media_category(
    media_id: int,
    req: SingleCategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    media.category = req.category
    db.commit()
    return {"id": media.id, "category": media.category}

@router.delete("/{media_id}")
def delete_media(
    media_id: int,
    permanent: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
        
    deleted_from_source = False
    if media.source_type == SourceType.GOOGLE_DRIVE and media.source_id:
        deleted_from_source = delete_file_from_google_drive(
            db=db,
            file_id=media.source_id,
            user_id=current_user.id,
            permanent=permanent
        )
    elif media.source_type == SourceType.S3_MINIO and media.source_id:
        try:
            from app.services.s3_storage import delete_s3_object
            delete_s3_object(media.source_id)
            deleted_from_source = True
        except Exception as e:
            logger.warning(f"Failed to delete S3 object: {e}")

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
    return {
        "status": "deleted",
        "id": media_id,
        "permanent": permanent,
        "deleted_from_source": deleted_from_source,
        "source_type": media.source_type
    }

class BatchFavoriteRequest(BaseModel):
    media_ids: List[int]
    is_favorite: bool = True

@router.patch("/batch-favorite")
def batch_favorite(
    req: BatchFavoriteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Bulk favorites or un-favorites selected media items for current user."""
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id
    ).update({"is_favorite": req.is_favorite}, synchronize_session=False)
    db.commit()
    return {"status": "success", "count": updated, "is_favorite": req.is_favorite}

class BatchCategoryRequest(BaseModel):
    media_ids: List[int]
    category: MediaCategory

@router.patch("/batch-category")
def batch_category(
    req: BatchCategoryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Bulk updates category for selected user media items."""
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id
    ).update({"category": req.category}, synchronize_session=False)
    db.commit()
    return {"status": "success", "count": updated, "category": req.category}

class BatchDeleteRequest(BaseModel):
    media_ids: List[int]
    permanent: bool = False

@router.post("/batch-delete")
def batch_delete_media(
    req: BatchDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Soft deletes or permanently deletes selected user media items, propagating deletion to cloud sources."""
    items = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id
    ).all()
    
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
    return {"status": "success", "count": len(items), "permanent": req.permanent}

class BulkDownloadRequest(BaseModel):
    media_ids: List[int]
    preset: Optional[str] = "original"  # "original" (raw uncompressed) or "optimized" (1080p WebP/JPEG)

@router.post("/bulk-download")
@router.post("/export-zip")
def bulk_download(
    req: BulkDownloadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Creates and streams a high-speed parallel ZIP archive of selected user photos.
    Supports 'original' (full uncompressed RAW/JPEG) and 'optimized' (1080p high-def WebP/JPEG) presets.
    """
    from concurrent.futures import ThreadPoolExecutor

    items = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id,
        Media.is_deleted == False
    ).all()

    if not items:
        raise HTTPException(status_code=404, detail="No media files found to download")

    def fetch_item_content(item: Media):
        base_name = item.filename or (os.path.basename(item.original_path) if item.original_path else f"photo_{item.id}.jpg")
        data = None

        if req.preset == "optimized":
            # Fast path: Serve 1080p rendition (85% smaller, 10x faster export)
            if item.thumbnail_1080_path and os.path.isfile(item.thumbnail_1080_path):
                try:
                    with open(item.thumbnail_1080_path, "rb") as f:
                        data = f.read()
                    name_part, _ = os.path.splitext(base_name)
                    base_name = f"{name_part}_optimized.webp"
                except Exception as e:
                    logger.warning(f"Could not read 1080p thumbnail for {item.id}: {e}")
            elif item.source_type == SourceType.GOOGLE_DRIVE and item.source_id:
                data = fetch_google_drive_thumbnail_bytes(item.source_id, db, size=1080)
                if data:
                    name_part, _ = os.path.splitext(base_name)
                    base_name = f"{name_part}_optimized.jpg"

        if data is None:
            # Fallback to original master file
            if item.original_path and os.path.isfile(item.original_path):
                try:
                    with open(item.original_path, "rb") as f:
                        data = f.read()
                except Exception as e:
                    logger.error(f"Error reading original file {item.original_path}: {e}")
            elif item.source_type == SourceType.GOOGLE_DRIVE and item.source_id:
                try:
                    data = b"".join(stream_google_drive_file(item.source_id, db))
                except Exception as e:
                    logger.error(f"Error streaming {item.id} from Google Drive into zip: {e}")
            elif item.source_type == SourceType.S3_MINIO and item.source_id:
                try:
                    from app.services.s3_storage import get_s3_bytes
                    data = get_s3_bytes(item.source_id)
                except Exception as e:
                    logger.error(f"Error reading S3 item {item.id} into zip: {e}")

        return base_name, data

    # Fetch files in parallel with up to 6 workers
    max_workers = min(6, max(1, len(items)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(fetch_item_content, items))

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        seen_filenames = set()
        for base_name, data in results:
            if not data:
                continue
            arc_name = base_name
            counter = 1
            while arc_name in seen_filenames:
                name_part, ext_part = os.path.splitext(base_name)
                arc_name = f"{name_part}_{counter}{ext_part}"
                counter += 1
            seen_filenames.add(arc_name)
            zip_file.writestr(arc_name, data)

    zip_buffer.seek(0)
    preset_tag = "_optimized" if req.preset == "optimized" else ""
    filename = f"memorypics{preset_tag}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"
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
def update_media_location(
    media_id: int,
    req: LocationUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update location coordinates for a user photo."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
        
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
def batch_update_location(
    req: BatchLocationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Bulk assigns location coordinates to user photos."""
    loc_name = req.location_name
    if not loc_name and req.latitude is not None and req.longitude is not None:
        loc_name = reverse_geocode(req.latitude, req.longitude)
        
    updated = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id
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
def propagate_cluster_locations(
    req: PropagateLocationsRequest = PropagateLocationsRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Propagates location from GPS anchor photos within current user library."""
    anchors = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.latitude != None,
        Media.longitude != None,
        Media.captured_at != None,
        Media.is_deleted == False
    ).all()
    
    if not anchors:
        return {"status": "skipped", "message": "No geotagged anchor photos found in library", "updated_count": 0}
        
    non_geo = db.query(Media).filter(
        Media.user_id == current_user.id,
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
        "propagated_count": updated_count,
        "anchor_count": len(anchors)
    }

@router.post("/rescan-geotags")
def rescan_all_geotags(
    propagate: bool = Query(True, description="Propagate location from anchors to same-outing photos"),
    propagate_hours: float = Query(3.0, description="Max hours gap for outing location propagation"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Comprehensive GPS sync:
    1. Scans local files for embedded EXIF GPS tags.
    2. Scans Google Drive photos via 128KB in-memory header range streams.
    3. Resolves location names instantly using offline GeoNames KD-Tree.
    4. Automatically propagates locations to temporal photo clusters (Canon DSLRs, non-GPS shots).
    """
    from PIL import Image
    from app.services.google_sync import scan_google_drive_geotags, propagate_locations_to_clusters
    from app.services.scanner import extract_exif

    # 1. Scan local files
    local_photos = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.source_type == SourceType.LOCAL,
        Media.latitude == None,
        Media.is_deleted == False
    ).all()
    local_geotagged = 0
    for p in local_photos:
        if p.original_path and os.path.isfile(p.original_path):
            try:
                with Image.open(p.original_path) as img:
                    exif = extract_exif(img, file_path=p.original_path)
                    if exif.get("latitude") is not None and exif.get("longitude") is not None:
                        p.latitude = exif["latitude"]
                        p.longitude = exif["longitude"]
                        p.location_name = exif.get("location_name")
                        local_geotagged += 1
            except Exception:
                pass
    if local_geotagged > 0:
        db.commit()

    # 2. Scan Google Drive photos in-memory
    gdrive_res = scan_google_drive_geotags(
        db=db,
        user_id=current_user.id,
        max_photos=2500,
        propagate_hours=propagate_hours if propagate else 0.0
    )

    # 3. Overall count of geotagged photos
    total_geotagged = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.latitude != None,
        Media.is_deleted == False
    ).count()

    return {
        "status": "success",
        "local_geotagged": local_geotagged,
        "gdrive_result": gdrive_res,
        "total_geotagged": total_geotagged,
        "total_library_geotagged": total_geotagged
    }
