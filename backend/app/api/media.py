import os
import io
import json
import zipfile
import shutil
import base64
import secrets
import subprocess
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from fastapi.responses import FileResponse, StreamingResponse, RedirectResponse, Response
from sqlalchemy.orm import Session, defer
from sqlalchemy import func, desc, extract, select

from app.database import get_db
from app.models.user import User
from app.models.media import Media, MediaCategory, SourceType
from app.models.album import Album
from app.models.person import FaceDetection
from app.api.auth import get_current_user, get_optional_current_user
from app.services.scanner import scan_file, extract_exif, reverse_geocode, compute_file_hash
from app.services.settings_service import get_storage_mode, get_setting
from app.services.drive_cache import get_google_drive_thumbnail_url, stream_google_drive_file, fetch_google_drive_thumbnail_bytes
from app.services.google_sync import delete_file_from_google_drive
from app.config import settings

logger = logging.getLogger("memorypics.api.media")
router = APIRouter()

def _format_media_item(item, burst_count=1, burst_id=None, burst_media_ids=None, is_burst_lead=False, burst_score=None, burst_type=None, has_faces=False, face_count=0):
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
        "has_faces": bool(has_faces),
        "face_count": face_count,
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
        "aesthetic_score": burst_score if burst_score is not None else getattr(item, "aesthetic_score", 0.0),
        "is_best_shot": is_burst_lead or getattr(item, "is_best_shot", False),
        "edit_recipe": getattr(item, "edit_recipe", None),
        "is_backed_up_gdrive": bool(getattr(item, "is_backed_up_gdrive", False)),
        "gdrive_backup_file_id": getattr(item, "gdrive_backup_file_id", None),
        "gdrive_backup_folder_name": getattr(item, "gdrive_backup_folder_name", None),
        "gdrive_backed_up_at": item.gdrive_backed_up_at.isoformat() if getattr(item, "gdrive_backed_up_at", None) else None,
    }

@router.get("")
def list_media(
    category: Optional[MediaCategory] = None,
    is_favorite: Optional[bool] = None,
    is_archived: bool = False,
    is_deleted: bool = False,
    geotagged_only: bool = Query(False),
    ids: Optional[str] = Query(None),
    person_id: Optional[int] = Query(None, description="Filter media strictly for a specific person"),
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
    if ids:
        id_list = [int(x.strip()) for x in ids.split(",") if x.strip().isdigit()]
        if id_list:
            query = query.filter(Media.id.in_(id_list))
    if category:
        query = query.filter(Media.category == category)
    if is_favorite is not None:
        query = query.filter(Media.is_favorite == is_favorite)
    if geotagged_only:
        query = query.filter(Media.latitude != None, Media.longitude != None)
    if person_id:
        person_media_ids = [
            r[0] for r in db.query(FaceDetection.media_id)
            .filter(FaceDetection.person_id == person_id)
            .distinct().all()
        ]
        query = query.filter(Media.id.in_(person_media_ids))
        
    total = query.count()
    items = query.options(defer(Media.extracted_text)).order_by(desc(Media.captured_at)).offset(offset).limit(limit).all()
    
    item_ids = [it.id for it in items]
    face_counts = {}
    if item_ids:
        face_counts = dict(
            db.query(
                FaceDetection.media_id,
                func.count(FaceDetection.id)
            ).filter(
                FaceDetection.media_id.in_(item_ids)
            ).group_by(FaceDetection.media_id).all()
        )

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [
            _format_media_item(
                item,
                has_faces=item.id in face_counts,
                face_count=face_counts.get(item.id, 0)
            ) for item in items
        ]
    }

@router.get("/timeline")
def get_timeline(
    category: Optional[MediaCategory] = None,
    scale: str = Query("day", regex="^(day|month|year)$"),
    collapse_bursts: bool = Query(True),
    has_people: Optional[bool] = Query(None, description="Filter for photos with/without detected people"),
    person_id: Optional[int] = Query(None, description="Filter timeline strictly for a specific person"),
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
    ).options(defer(Media.extracted_text))
    if category:
        query = query.filter(Media.category == category)
    if person_id:
        person_media_ids = [
            r[0] for r in db.query(FaceDetection.media_id)
            .filter(FaceDetection.person_id == person_id)
            .distinct().all()
        ]
        query = query.filter(Media.id.in_(person_media_ids))
        
    items = query.order_by(desc(Media.captured_at)).all()

    # 1 fast indexed query to retrieve face detection counts for the returned media items
    item_ids = [it.id for it in items]
    face_counts = {}
    if item_ids:
        face_counts = dict(
            db.query(
                FaceDetection.media_id,
                func.count(FaceDetection.id)
            ).filter(
                FaceDetection.media_id.in_(item_ids)
            ).group_by(FaceDetection.media_id).all()
        )

    if has_people is True:
        items = [it for it in items if it.id in face_counts]
    elif has_people is False:
        items = [it for it in items if it.id not in face_counts]

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
            "has_faces": item.id in face_counts,
            "face_count": face_counts.get(item.id, 0),
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
            "burst_type": burst_type,
            "aesthetic_score": burst_score if burst_score is not None else getattr(item, "aesthetic_score", 0.0),
            "is_best_shot": is_burst_lead or getattr(item, "is_best_shot", False)
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
    current_month = now.month
    current_day = now.day
    current_year = now.year
    
    # ANSI SQL extract works identically across PostgreSQL and SQLite
    items = db.query(Media).filter(
        Media.user_id == current_user.id,
        extract("month", Media.captured_at) == current_month,
        extract("day", Media.captured_at) == current_day,
        extract("year", Media.captured_at) < current_year,
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

    # Use fast scalar column projection to avoid instantiating heavy ORM objects with EXIF & OCR
    items = db.query(
        Media.id,
        Media.filename,
        Media.latitude,
        Media.longitude,
        Media.location_name,
        Media.captured_at
    ).filter(
        Media.user_id == current_user.id,
        Media.latitude != None,
        Media.longitude != None,
        Media.is_deleted == False
    ).all()

    return [{
        "id": m[0],
        "filename": m[1],
        "latitude": m[2],
        "longitude": m[3],
        "location_name": m[4],
        "captured_at": m[5],
        "thumbnail_url": f"/api/v1/media/{m[0]}/thumbnail?size=256"
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
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

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

@router.get("/{media_id}/aesthetics")
def get_media_aesthetics_endpoint(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns AI aesthetic quality scoring breakdown, sharpness analysis,
    lighting/exposure balance, smile/expression metrics, and burst comparison rank.
    """
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.burst_engine import get_media_aesthetics
    result = get_media_aesthetics(db, media_id, user_id=current_user.id)
    return result

@router.post("/{media_id}/set-best-shot")
def set_media_best_shot(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually designates a photo as the primary Best Shot for its burst sequence.
    """
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.burst_engine import get_burst_for_media
    burst = get_burst_for_media(db, media_id, user_id=current_user.id)
    if not burst:
        media.is_best_shot = True
        db.commit()
        return {"status": "success", "media_id": media.id, "is_best_shot": True}

    sibling_ids = [it["id"] for it in burst["items"]]
    for sid in sibling_ids:
        m = db.query(Media).filter(Media.id == sid).first()
        if m:
            m.is_best_shot = (m.id == media_id)
    db.commit()

    return {"status": "success", "media_id": media.id, "is_best_shot": True, "burst_id": burst["id"]}

class CaptureFrameRequest(BaseModel):
    timestamp_seconds: float = 0.0
    save_to_library: bool = True
    image_base64: Optional[str] = None
    title: Optional[str] = None

@router.post("/{media_id}/capture-frame")
def capture_video_frame(
    media_id: int,
    req: CaptureFrameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Extracts a pristine, high-resolution still frame from a video at exact timestamp.
    Accepts client-side canvas snapshot or runs server-side ffmpeg extraction.
    Optionally catalogs it directly into user library as an independent photo memory.
    """
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    ts = max(0.0, float(req.timestamp_seconds))
    upload_dir = os.path.join(settings.MEDIA_DIR, "uploads", f"user_{current_user.id}")
    os.makedirs(upload_dir, exist_ok=True)

    out_filename = f"frame_{media.id}_{int(ts * 100)}_{secrets.token_hex(4)}.jpg"
    out_path = os.path.join(upload_dir, out_filename)

    if req.image_base64:
        try:
            header, encoded = req.image_base64.split(",", 1) if "," in req.image_base64 else ("", req.image_base64)
            raw_bytes = base64.b64decode(encoded)
            with open(out_path, "wb") as f:
                f.write(raw_bytes)
        except Exception as e:
            logger.error(f"Failed to decode client frame base64: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid image frame data: {e}")
    else:
        video_path = media.original_path
        if not video_path or not os.path.isfile(video_path):
            raise HTTPException(status_code=400, detail="Source video file not found on disk for server extraction")

        cmd = [
            "ffmpeg",
            "-y",
            "-ss", str(ts),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            out_path
        ]
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
            if res.returncode != 0 or not os.path.isfile(out_path):
                err_msg = res.stderr.decode("utf-8", errors="ignore")
                logger.error(f"ffmpeg frame extraction failed: {err_msg}")
                raise HTTPException(status_code=500, detail="Failed to capture frame from video")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Frame capture error: {e}")

    new_media_id = None
    if req.save_to_library:
        from app.services.scanner import scan_file
        new_media = scan_file(db, out_path, SourceType.MANUAL_UPLOAD, user_id=current_user.id)
        if new_media:
            if media.captured_at:
                new_media.captured_at = media.captured_at + timedelta(seconds=ts)
            new_media.latitude = media.latitude
            new_media.longitude = media.longitude
            new_media.location_name = media.location_name
            new_media.camera_make = media.camera_make
            new_media.camera_model = media.camera_model
            new_media.category = MediaCategory.MEMORY
            db.commit()
            new_media_id = new_media.id

    return {
        "status": "success",
        "saved_to_library": bool(new_media_id),
        "media_id": new_media_id,
        "timestamp_seconds": ts,
        "frame_filename": out_filename,
        "thumbnail_url": f"/api/v1/media/{new_media_id}/thumbnail?size=256" if new_media_id else None,
        "preview_url": f"/api/v1/media/{new_media_id}/thumbnail?size=1080" if new_media_id else None,
        "view_url": f"/api/v1/media/{new_media_id}/view" if new_media_id else None
    }

class SaveCollageRequest(BaseModel):
    image_base64: str
    layout_name: Optional[str] = "grid"
    aspect_ratio: Optional[str] = "1:1"
    source_media_ids: Optional[List[int]] = []

@router.post("/save-collage")
def save_created_collage(
    req: SaveCollageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Saves a canvas-rendered collage as a high-resolution photo in the user's library.
    Automatically catalogs and indexes it for immediate viewing on the timeline.
    """
    if not req.image_base64:
        raise HTTPException(status_code=400, detail="Missing collage image data")

    try:
        header, encoded = req.image_base64.split(",", 1) if "," in req.image_base64 else ("", req.image_base64)
        image_data = base64.b64decode(encoded)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image data: {e}")

    upload_dir = os.path.join(settings.MEDIA_DIR, "uploads", f"user_{current_user.id}")
    os.makedirs(upload_dir, exist_ok=True)

    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"Collage_{timestamp_str}_{secrets.token_hex(4)}.jpg"
    dest_path = os.path.join(upload_dir, filename)

    with open(dest_path, "wb") as f:
        f.write(image_data)

    from app.services.scanner import scan_file
    new_media = scan_file(db, dest_path, SourceType.MANUAL_UPLOAD, user_id=current_user.id)
    if not new_media:
        raise HTTPException(status_code=500, detail="Failed to catalog saved collage")

    new_media.category = MediaCategory.MEMORY
    db.commit()

    return {
        "status": "success",
        "id": new_media.id,
        "filename": new_media.filename,
        "thumbnail_url": f"/api/v1/media/{new_media.id}/thumbnail?size=256",
        "view_url": f"/api/v1/media/{new_media.id}/view"
    }

class SaveEditRequest(BaseModel):
    image_base64: str
    save_as_new: bool = True
    recipe: Optional[Dict[str, Any]] = None

class EditRecipeRequest(BaseModel):
    recipe: Dict[str, Any]

class SaveHighlightReelRequest(BaseModel):
    video_base64: str
    title: Optional[str] = "Highlight Reel"
    source_media_ids: Optional[List[int]] = []
    duration_seconds: Optional[float] = None

@router.post("/{media_id}/save-edit")
def save_edited_photo(
    media_id: int,
    req: SaveEditRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Saves an edited version of a photo.
    If save_as_new=True: ingests as a new photo in the user's library with inherited EXIF.
    If save_as_new=False: updates the existing media item's edit_recipe and marks is_enhanced=True.
    """
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    if not req.image_base64:
        raise HTTPException(status_code=400, detail="Missing edited image data")

    try:
        header, encoded = req.image_base64.split(",", 1) if "," in req.image_base64 else ("", req.image_base64)
        image_data = base64.b64decode(encoded)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image data: {e}")

    recipe_json = json.dumps(req.recipe) if req.recipe else None

    if req.save_as_new:
        upload_dir = os.path.join(settings.MEDIA_DIR, "uploads", f"user_{current_user.id}")
        os.makedirs(upload_dir, exist_ok=True)
        timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        stem, _ = os.path.splitext(media.filename)
        filename = f"{stem}_edited_{timestamp_str}_{secrets.token_hex(3)}.jpg"
        dest_path = os.path.join(upload_dir, filename)

        with open(dest_path, "wb") as f:
            f.write(image_data)

        from app.services.scanner import scan_file
        new_media = scan_file(db, dest_path, SourceType.MANUAL_UPLOAD, user_id=current_user.id)
        if not new_media:
            raise HTTPException(status_code=500, detail="Failed to catalog edited photo")

        # Inherit parent EXIF & metadata
        new_media.captured_at = media.captured_at
        new_media.latitude = media.latitude
        new_media.longitude = media.longitude
        new_media.location_name = media.location_name
        new_media.camera_make = media.camera_make
        new_media.camera_model = media.camera_model
        new_media.iso = media.iso
        new_media.focal_length = media.focal_length
        new_media.exposure_time = media.exposure_time
        new_media.category = MediaCategory.MEMORY
        new_media.is_enhanced = True
        new_media.edit_recipe = recipe_json
        db.commit()

        return {
            "status": "success",
            "saved_as": "new_copy",
            "id": new_media.id,
            "filename": new_media.filename,
            "thumbnail_url": f"/api/v1/media/{new_media.id}/thumbnail?size=256",
            "preview_url": f"/api/v1/media/{new_media.id}/thumbnail?size=1080",
            "view_url": f"/api/v1/media/{new_media.id}/view"
        }
    else:
        # Save recipe overlay onto current media item
        media.edit_recipe = recipe_json
        media.is_enhanced = True

        if media.source_type == SourceType.LOCAL and os.path.exists(media.original_path):
            try:
                from PIL import Image
                im = Image.open(io.BytesIO(image_data))
                thumb_dir = os.path.join(settings.THUMBNAIL_DIR, "256")
                os.makedirs(thumb_dir, exist_ok=True)
                t_path = os.path.join(thumb_dir, f"thumb_{media.id}.webp")
                im.thumbnail((256, 256), Image.Resampling.LANCZOS)
                im.save(t_path, format="WEBP", quality=85)
                media.thumbnail_256_path = t_path
            except Exception as e:
                logger.warning(f"Could not update local thumbnail for edited media {media.id}: {e}")

        db.commit()
        return {
            "status": "success",
            "saved_as": "recipe_overlay",
            "id": media.id,
            "filename": media.filename,
            "edit_recipe": req.recipe,
            "thumbnail_url": f"/api/v1/media/{media.id}/thumbnail?size=256",
            "view_url": f"/api/v1/media/{media.id}/view"
        }

@router.patch("/{media_id}/edit-recipe")
def update_edit_recipe(
    media_id: int,
    req: EditRecipeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Updates non-destructive recipe parameters (adjustments, crop, preset) on a media item."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    media.edit_recipe = json.dumps(req.recipe)
    media.is_enhanced = True
    db.commit()
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

    return {"status": "success", "id": media.id, "recipe": req.recipe}

@router.post("/{media_id}/revert-edit")
def revert_photo_edits(
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reverts any non-destructive recipe adjustments back to original unedited state."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id and media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    media.edit_recipe = None
    media.is_enhanced = False
    db.commit()
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

    return {"status": "reverted", "id": media.id}

@router.post("/save-highlight-reel")
def save_highlight_reel(
    req: SaveHighlightReelRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Saves an exported Highlight Reel video (MP4/WebM) directly into the user's library as a Memory video.
    """
    if not req.video_base64:
        raise HTTPException(status_code=400, detail="Missing video base64 data")

    try:
        header, encoded = req.video_base64.split(",", 1) if "," in req.video_base64 else ("", req.video_base64)
        video_bytes = base64.b64decode(encoded)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 video data: {e}")

    upload_dir = os.path.join(settings.MEDIA_DIR, "uploads", f"user_{current_user.id}")
    os.makedirs(upload_dir, exist_ok=True)

    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    ext = ".mp4" if "mp4" in header.lower() else ".webm"
    clean_title = (req.title or "Highlight_Reel").strip().replace(" ", "_")
    filename = f"{clean_title}_{timestamp_str}_{secrets.token_hex(4)}{ext}"
    dest_path = os.path.join(upload_dir, filename)

    with open(dest_path, "wb") as f:
        f.write(video_bytes)

    from app.services.scanner import scan_file
    new_media = scan_file(db, dest_path, SourceType.MANUAL_UPLOAD, user_id=current_user.id)
    if not new_media:
        raise HTTPException(status_code=500, detail="Failed to catalog highlight reel video")

    new_media.category = MediaCategory.MEMORY
    new_media.duration_seconds = req.duration_seconds or 15.0
    new_media.mime_type = "video/mp4" if ext == ".mp4" else "video/webm"
    db.commit()

    return {
        "status": "success",
        "id": new_media.id,
        "filename": new_media.filename,
        "duration_seconds": new_media.duration_seconds,
        "thumbnail_url": f"/api/v1/media/{new_media.id}/thumbnail?size=256",
        "view_url": f"/api/v1/media/{new_media.id}/view"
    }

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
            return FileResponse(
                media.original_path,
                media_type=media.mime_type or "image/jpeg",
                headers={
                    "Content-Disposition": "inline",
                    "Cache-Control": "public, max-age=86400"
                }
            )
            
    thumb_path = media.thumbnail_256_path if size in ("256", "512") else media.thumbnail_1080_path
    if thumb_path and os.path.isfile(thumb_path):
        return FileResponse(
            thumb_path,
            media_type="image/webp",
            headers={
                "Cache-Control": "public, max-age=31536000, immutable",
                "X-Accel-Buffering": "no"
            }
        )
        
    if media.original_path and os.path.isfile(media.original_path):
        return FileResponse(
            media.original_path,
            media_type=media.mime_type or "image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"}
        )

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
            headers={
                "Content-Disposition": "inline",
                "Cache-Control": "private, max-age=604800"
            }
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
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

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
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

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
    return run_library_quality_scan(db, force=force, user_id=current_user.id)

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
    album_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Directly uploads a photo into user account directory and catalogs with user_id with 100% bit-for-bit fidelity."""
    upload_dir = os.path.join(settings.MEDIA_DIR, "uploads", f"user_{current_user.id}")
    os.makedirs(upload_dir, exist_ok=True)
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    dest_filename = f"{timestamp}_{file.filename}"
    dest_path = os.path.join(upload_dir, dest_filename)
    
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    media = scan_file(db, dest_path, SourceType.MANUAL_UPLOAD, user_id=current_user.id)
    if not media:
        raise HTTPException(status_code=400, detail="Uploaded file is not a supported media format")
        
    if album_id:
        album = db.query(Album).filter(Album.id == album_id).first()
        if album and (album.user_id == current_user.id or current_user.is_admin):
            if media not in album.media:
                album.media.append(media)
                if not album.cover_media_id:
                    album.cover_media_id = media.id
                db.commit()

    return {
        "status": "success",
        "id": media.id,
        "user_id": current_user.id,
        "category": media.category.value if hasattr(media.category, "value") else str(media.category),
        "filename": media.filename,
        "item": _format_media_item(media)
    }

@router.post("/upload-batch")
def upload_batch(
    files: List[UploadFile] = File(...),
    album_id: Optional[int] = Form(None),
    relative_paths: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    High-throughput batch upload endpoint processing up to 50 items at once.
    Preserves original file quality, EXIF metadata, folder relative paths, and auto-pairs Apple Live Photos (.heic + .mov).
    """
    upload_dir = os.path.join(settings.MEDIA_DIR, "uploads", f"user_{current_user.id}")
    os.makedirs(upload_dir, exist_ok=True)

    parsed_paths = {}
    if relative_paths:
        try:
            parsed_paths = json.loads(relative_paths)
            if not isinstance(parsed_paths, dict):
                parsed_paths = {}
        except Exception:
            parsed_paths = {}

    album = None
    if album_id:
        album = db.query(Album).filter(Album.id == album_id).first()
        if album and album.user_id != current_user.id and not current_user.is_admin:
            album = None

    uploaded_items = []
    duplicate_items = []
    failed_items = []

    batch_prefix = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    stem_tokens = {}
    
    # Save files to disk preserving bit-for-bit uncompressed content
    saved_files = []
    for idx, file in enumerate(files):
        try:
            clean_filename = os.path.basename(file.filename or f"upload_{idx}.jpg")
            stem, ext = os.path.splitext(clean_filename)
            stem_key = stem.lower()
            if stem_key not in stem_tokens:
                stem_tokens[stem_key] = f"{idx:02d}_{secrets.token_hex(2)}"
            unique_token = stem_tokens[stem_key]
            dest_filename = f"{batch_prefix}_{unique_token}_{clean_filename}"

            rel_path = parsed_paths.get(clean_filename) or parsed_paths.get(file.filename)
            if rel_path:
                rel_dir = os.path.dirname(rel_path).strip("/\\")
                target_dir = os.path.join(upload_dir, rel_dir) if rel_dir else upload_dir
                os.makedirs(target_dir, exist_ok=True)
                dest_path = os.path.join(target_dir, dest_filename)
            else:
                dest_path = os.path.join(upload_dir, dest_filename)

            with open(dest_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            saved_files.append((clean_filename, dest_path))
        except Exception as e:
            logger.error(f"Failed to save uploaded file {file.filename}: {e}")
            failed_items.append({"filename": file.filename, "error": str(e)})

    # Sort files so still images (.heic, .jpg, .dng) are scanned before companion video (.mov, .mp4)
    def file_sort_key(item):
        ext = os.path.splitext(item[0])[1].lower()
        return 1 if ext in [".mov", ".mp4", ".mkv", ".webm"] else 0

    saved_files.sort(key=file_sort_key)

    for clean_filename, dest_path in saved_files:
        try:
            file_hash = compute_file_hash(dest_path)
            existing = db.query(Media).filter(Media.file_hash == file_hash).first()
            if existing:
                if existing.user_id != current_user.id and not existing.user_id:
                    existing.user_id = current_user.id
                    db.commit()
                if album and existing not in album.media:
                    album.media.append(existing)
                    if not album.cover_media_id:
                        album.cover_media_id = existing.id
                    db.commit()
                if os.path.exists(dest_path) and dest_path != existing.original_path:
                    try:
                        os.remove(dest_path)
                    except Exception:
                        pass
                duplicate_items.append({
                    "id": existing.id,
                    "filename": clean_filename,
                    "item": _format_media_item(existing)
                })
                continue

            media = scan_file(db, dest_path, SourceType.MANUAL_UPLOAD, user_id=current_user.id)
            if media:
                if album and media not in album.media:
                    album.media.append(media)
                    if not album.cover_media_id:
                        album.cover_media_id = media.id
                    db.commit()
                uploaded_items.append({
                    "id": media.id,
                    "filename": clean_filename,
                    "item": _format_media_item(media)
                })
            else:
                failed_items.append({"filename": clean_filename, "error": "Unsupported media format or corrupted file"})
        except Exception as e:
            db.rollback()
            logger.error(f"Error scanning uploaded file {clean_filename}: {e}")
            failed_items.append({"filename": clean_filename, "error": str(e)})

    return {
        "status": "success",
        "total": len(files),
        "uploaded_count": len(uploaded_items),
        "duplicates_count": len(duplicate_items),
        "failed_count": len(failed_items),
        "items": uploaded_items,
        "duplicates": duplicate_items,
        "errors": failed_items
    }

class CheckDuplicatesRequest(BaseModel):
    hashes: List[str]

@router.post("/check-duplicates")
def check_duplicates(
    payload: CheckDuplicatesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Checks if a list of SHA-256 hashes already exists in the system or library.
    Returns list of existing hashes, allowing client pre-flight duplicate detection.
    """
    if not payload.hashes:
        return {"existing_hashes": []}

    query_hashes = [h.strip().lower() for h in payload.hashes[:500] if h.strip()]
    if not query_hashes:
        return {"existing_hashes": []}

    existing = db.query(Media.file_hash).filter(Media.file_hash.in_(query_hashes)).all()
    existing_hashes = [h[0] for h in existing if h[0]]
    return {"existing_hashes": existing_hashes}

# ==============================================================================
# Chunked & Resumable Upload Endpoints (For Large 4K Videos & RAW Files > 25MB)
# ==============================================================================

@router.post("/upload-chunk/init")
def init_chunked_upload(
    filename: str = Form(...),
    file_size: int = Form(...),
    total_chunks: int = Form(...),
    chunk_size: int = Form(5242880), # 5MB default chunk
    album_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Initializes a resumable chunked upload session for large files."""
    upload_id = secrets.token_hex(16)
    chunk_dir = os.path.join(settings.MEDIA_DIR, "uploads", ".chunks", upload_id)
    os.makedirs(chunk_dir, exist_ok=True)

    meta = {
        "upload_id": upload_id,
        "user_id": current_user.id,
        "filename": filename,
        "file_size": file_size,
        "total_chunks": total_chunks,
        "chunk_size": chunk_size,
        "album_id": album_id,
        "created_at": datetime.utcnow().isoformat()
    }
    with open(os.path.join(chunk_dir, "meta.json"), "w") as f:
        json.dump(meta, f)

    return {
        "status": "initialized",
        "upload_id": upload_id,
        "chunk_size": chunk_size,
        "total_chunks": total_chunks
    }

@router.post("/upload-chunk")
def upload_chunk_part(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Uploads a single 5MB chunk slice."""
    chunk_dir = os.path.join(settings.MEDIA_DIR, "uploads", ".chunks", upload_id)
    if not os.path.isdir(chunk_dir):
        raise HTTPException(status_code=404, detail="Upload session expired or invalid")

    chunk_path = os.path.join(chunk_dir, f"chunk_{chunk_index:05d}")
    with open(chunk_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        "status": "chunk_saved",
        "upload_id": upload_id,
        "chunk_index": chunk_index,
        "received": True
    }

@router.get("/upload-chunk/status/{upload_id}")
def get_chunked_upload_status(
    upload_id: str,
    current_user: User = Depends(get_current_user)
):
    """Returns list of already uploaded chunks for resumable recovery."""
    chunk_dir = os.path.join(settings.MEDIA_DIR, "uploads", ".chunks", upload_id)
    if not os.path.isdir(chunk_dir):
        raise HTTPException(status_code=404, detail="Upload session not found")

    meta_path = os.path.join(chunk_dir, "meta.json")
    meta = {}
    if os.path.isfile(meta_path):
        with open(meta_path, "r") as f:
            meta = json.load(f)

    uploaded_chunks = []
    for f in os.listdir(chunk_dir):
        if f.startswith("chunk_"):
            try:
                uploaded_chunks.append(int(f.replace("chunk_", "")))
            except Exception:
                pass
    uploaded_chunks.sort()

    return {
        "upload_id": upload_id,
        "uploaded_chunks": uploaded_chunks,
        "total_chunks": meta.get("total_chunks", 0),
        "filename": meta.get("filename")
    }

@router.post("/upload-chunk/complete")
def complete_chunked_upload(
    upload_id: str = Form(...),
    filename: Optional[str] = Form(None),
    album_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reassembles chunk slices in order into an authoritative master file, runs scan_file, and cleans up temp slices."""
    chunk_dir = os.path.join(settings.MEDIA_DIR, "uploads", ".chunks", upload_id)
    if not os.path.isdir(chunk_dir):
        raise HTTPException(status_code=404, detail="Upload session not found")

    meta_path = os.path.join(chunk_dir, "meta.json")
    meta = {}
    if os.path.isfile(meta_path):
        with open(meta_path, "r") as f:
            meta = json.load(f)

    target_filename = filename or meta.get("filename") or f"video_{secrets.token_hex(4)}.mp4"
    total_chunks = meta.get("total_chunks", 0)
    target_album_id = album_id if album_id is not None else meta.get("album_id")

    upload_dir = os.path.join(settings.MEDIA_DIR, "uploads", f"user_{current_user.id}")
    os.makedirs(upload_dir, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    dest_filename = f"{timestamp}_{target_filename}"
    dest_path = os.path.join(upload_dir, dest_filename)

    try:
        with open(dest_path, "wb") as out_file:
            for i in range(total_chunks):
                c_path = os.path.join(chunk_dir, f"chunk_{i:05d}")
                if not os.path.isfile(c_path):
                    raise HTTPException(status_code=400, detail=f"Missing chunk index {i} out of {total_chunks}")
                with open(c_path, "rb") as c_in:
                    shutil.copyfileobj(c_in, out_file)
    except Exception as e:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise HTTPException(status_code=500, detail=f"Failed to reassemble chunks: {e}")

    shutil.rmtree(chunk_dir, ignore_errors=True)

    # Check for duplicates before creating new record
    file_hash = compute_file_hash(dest_path)
    existing = db.query(Media).filter(Media.file_hash == file_hash).first()
    if existing:
        if existing.user_id != current_user.id and not existing.user_id:
            existing.user_id = current_user.id
            db.commit()
        if target_album_id:
            album = db.query(Album).filter(Album.id == target_album_id).first()
            if album and (album.user_id == current_user.id or current_user.is_admin):
                if existing not in album.media:
                    album.media.append(existing)
                    if not album.cover_media_id:
                        album.cover_media_id = existing.id
                    db.commit()
        # Clean up temporary reassembled duplicate file from app storage
        if os.path.exists(dest_path) and dest_path != existing.original_path:
            try:
                os.remove(dest_path)
            except Exception:
                pass
        return {
            "status": "duplicate",
            "is_duplicate": True,
            "id": existing.id,
            "filename": target_filename,
            "item": _format_media_item(existing)
        }

    media = scan_file(db, dest_path, SourceType.MANUAL_UPLOAD, user_id=current_user.id)
    if not media:
        raise HTTPException(status_code=400, detail="Reassembled file is not a supported media format")

    if target_album_id:
        album = db.query(Album).filter(Album.id == target_album_id).first()
        if album and (album.user_id == current_user.id or current_user.is_admin):
            if media not in album.media:
                album.media.append(media)
                if not album.cover_media_id:
                    album.cover_media_id = media.id
                db.commit()

    return {
        "status": "success",
        "id": media.id,
        "filename": media.filename,
        "item": _format_media_item(media)
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
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

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
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

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
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

    return {"id": media.id, "category": media.category}

def is_file_on_readonly_mount(file_path: Optional[str]) -> bool:
    """Returns True if the file or its directory resides on a read-only filesystem."""
    if not file_path:
        return False
    target = file_path if os.path.exists(file_path) else os.path.dirname(file_path)
    if not target or not os.path.exists(target):
        return False
    return not os.access(target, os.W_OK)

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

    is_readonly_mount = False
    if permanent:
        if media.source_type == SourceType.LOCAL and is_file_on_readonly_mount(media.original_path):
            is_readonly_mount = True

        if is_readonly_mount:
            media.is_deleted = True
            media.pending_disk_deletion = True
            media.marked_for_deletion_at = datetime.utcnow()
        else:
            if media.original_path and os.path.isfile(media.original_path):
                try:
                    os.remove(media.original_path)
                except Exception:
                    pass
            db.delete(media)
    else:
        media.is_deleted = True
        
    db.commit()
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

    return {
        "status": "pending_disk_purge" if is_readonly_mount else "deleted",
        "id": media_id,
        "permanent": permanent,
        "pending_disk_deletion": is_readonly_mount,
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
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

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
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

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

    purged_count = 0
    pending_disk_count = 0

    for item in items:
        if item.source_type == SourceType.S3_MINIO and item.source_id and req.permanent:
            try:
                from app.services.s3_storage import delete_s3_object
                delete_s3_object(item.source_id)
            except Exception:
                pass

        if req.permanent:
            if item.source_type == SourceType.LOCAL and is_file_on_readonly_mount(item.original_path):
                item.is_deleted = True
                item.pending_disk_deletion = True
                item.marked_for_deletion_at = datetime.utcnow()
                pending_disk_count += 1
            else:
                if item.original_path and os.path.isfile(item.original_path):
                    try:
                        os.remove(item.original_path)
                    except Exception:
                        pass
                db.delete(item)
                purged_count += 1
        else:
            item.is_deleted = True

    db.commit()
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

    return {
        "status": "success",
        "count": len(items),
        "permanent": req.permanent,
        "purged_count": purged_count,
        "pending_disk_count": pending_disk_count
    }

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

    items = db.query(Media).options(defer(Media.extracted_text)).filter(
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
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

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
    
    import bisect

    # Sort anchors strictly by captured_at to enable O(log K) binary search instead of O(N*K) nested scan
    anchors.sort(key=lambda a: a.captured_at)
    anchor_times = [a.captured_at.timestamp() for a in anchors]
    num_anchors = len(anchor_times)
    max_gap_seconds = req.max_gap_hours * 3600.0

    updated_count = 0
    for item in non_geo:
        item_time = item.captured_at.timestamp()
        idx = bisect.bisect_left(anchor_times, item_time)

        best_anchor = None
        min_gap = max_gap_seconds

        # Check left neighbor
        if idx > 0:
            gap = item_time - anchor_times[idx - 1]
            if gap <= min_gap:
                min_gap = gap
                best_anchor = anchors[idx - 1]

        # Check right neighbor
        if idx < num_anchors:
            gap = anchor_times[idx] - item_time
            if gap <= min_gap:
                min_gap = gap
                best_anchor = anchors[idx]

        if best_anchor:
            item.latitude = best_anchor.latitude
            item.longitude = best_anchor.longitude
            item.location_name = best_anchor.location_name
            updated_count += 1
            
    db.commit()
    try:
        from app.services.burst_engine import invalidate_burst_cache
        invalidate_burst_cache(current_user.id)
    except Exception:
        pass

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
