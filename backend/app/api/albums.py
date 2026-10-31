import json
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, or_

from app.database import get_db
from app.models.user import User
from app.models.album import Album
from app.models.media import Media, MediaCategory
from app.models.person import Person, FaceDetection
from app.api.auth import get_current_user, get_optional_current_user
from app.services.event_clustering import cluster_events

router = APIRouter()

class CreateAlbumRequest(BaseModel):
    name: str
    description: Optional[str] = None
    media_ids: Optional[List[int]] = None
    is_dynamic: Optional[bool] = False
    rules: Optional[Dict[str, Any]] = None

class UpdateAlbumRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cover_media_id: Optional[int] = None
    rules: Optional[Dict[str, Any]] = None

class AddPhotosToAlbumRequest(BaseModel):
    media_ids: List[int]

def resolve_dynamic_album_photos(album: Album, db: Session, user_id: int) -> List[Media]:
    """Resolves live photos matching the dynamic smart album's saved query rules."""
    if not album.rules:
        return []
    try:
        rules = json.loads(album.rules) if isinstance(album.rules, str) else album.rules
    except Exception:
        return []

    query = db.query(Media).filter(
        Media.user_id == user_id,
        Media.is_deleted == False,
        Media.is_archived == False
    )

    # 1. Search query (semantic or keyword)
    search_text = rules.get("query") or rules.get("search_text")
    if search_text:
        term = f"%{search_text}%"
        query = query.filter(
            or_(
                Media.filename.ilike(term),
                Media.location_name.ilike(term),
                Media.caption.ilike(term) if hasattr(Media, "caption") else False
            )
        )

    # 2. Person filter (Face detection linking)
    person_ids = rules.get("person_ids")
    if person_ids:
        for pid in person_ids:
            face_subquery = db.query(FaceDetection.media_id).filter(FaceDetection.person_id == pid).subquery()
            query = query.filter(Media.id.in_(face_subquery))

    # 3. Category filter
    category = rules.get("category")
    if category:
        query = query.filter(Media.category == category)

    # 4. Favorite only
    if rules.get("is_favorite") is True:
        query = query.filter(Media.is_favorite == True)

    # 5. Rating filter
    if rules.get("min_rating"):
        query = query.filter(Media.rating >= rules["min_rating"])

    # 6. Date Range
    if rules.get("start_date"):
        query = query.filter(Media.captured_at >= rules["start_date"])
    if rules.get("end_date"):
        query = query.filter(Media.captured_at <= rules["end_date"])

    # 7. City / Location
    if rules.get("city"):
        query = query.filter(Media.location_name.ilike(f"%{rules['city']}%"))

    return query.order_by(desc(Media.captured_at)).limit(500).all()

def _perform_auto_curate(db: Session, user_id: int) -> List[Album]:
    """Helper to auto-generate smart albums based on places and events for a specific user."""
    created_albums = []
    
    # 1. Curate from prominent places (>= 3 photos)
    places = db.query(
        Media.location_name,
        func.count(Media.id).label("cnt")
    ).filter(
        Media.user_id == user_id,
        Media.is_deleted == False,
        Media.location_name != None
    ).group_by(Media.location_name).having(func.count(Media.id) >= 3).all()

    for place_name, cnt in places:
        city = place_name.split(",")[0].strip()
        album_name = f"{city} Memories"
        
        existing = db.query(Album).filter(
            Album.user_id == user_id,
            Album.name == album_name
        ).first()
        if existing:
            continue

        photos = db.query(Media).filter(
            Media.user_id == user_id,
            Media.is_deleted == False,
            Media.location_name == place_name
        ).order_by(desc(Media.captured_at)).all()

        if photos:
            sharp_cover = next((p for p in photos if not p.is_blurry), photos[0])
            album = Album(
                user_id=user_id,
                name=album_name,
                description=f"Curated collection of {len(photos)} memories from {place_name}.",
                cover_media_id=sharp_cover.id
            )
            album.media.extend(photos)
            db.add(album)
            created_albums.append(album)

    # 2. Curate from prominent spatiotemporal trips / outings (>= 10 photos)
    trips = cluster_events(db, user_id=user_id)
    for trip in trips:
        if trip["photo_count"] >= 10:
            trip_title = trip["title"]
            album_name = f"Trip: {trip_title}"
            existing = db.query(Album).filter(
                Album.user_id == user_id,
                Album.name == album_name
            ).first()
            if existing:
                continue

            trip_photos = db.query(Media).filter(
                Media.user_id == user_id,
                Media.id.in_(trip["media_ids"])
            ).all()
            if trip_photos:
                album = Album(
                    user_id=user_id,
                    name=album_name,
                    description=f"Outing on {trip['date']} with {len(trip_photos)} photos.",
                    cover_media_id=trip.get("cover_id") or trip_photos[0].id
                )
                album.media.extend(trip_photos)
                db.add(album)
                created_albums.append(album)

    if created_albums:
        db.commit()
        for a in created_albums:
            db.refresh(a)

    return created_albums

@router.get("/collections/smart")
def get_smart_collections(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns auto-computed smart collections strictly for the current user:
    - Places (grouped by location_name)
    - Trips (spatiotemporal outings)
    - People (detected individuals)
    - Favorites & Categories
    """
    if not current_user:
        return {
            "places": [],
            "trips": [],
            "people": [],
            "favorites": {"count": 0, "cover_id": None, "cover_thumbnail_url": None},
            "categories": {"screenshots": 0, "receipts_bills": 0, "blurry": 0}
        }

    uid = current_user.id

    # 1. Places Collections
    places_raw = db.query(
        Media.location_name,
        func.count(Media.id).label("photo_count")
    ).filter(
        Media.user_id == uid,
        Media.is_deleted == False,
        Media.location_name != None
    ).group_by(Media.location_name).order_by(desc("photo_count")).all()

    places = []
    for loc_name, count in places_raw:
        cover = db.query(Media).filter(
            Media.user_id == uid,
            Media.is_deleted == False,
            Media.location_name == loc_name
        ).order_by(Media.is_blurry.asc(), desc(Media.captured_at)).first()

        city = loc_name.split(",")[0].strip()
        places.append({
            "location_name": loc_name,
            "city": city,
            "photo_count": count,
            "cover_id": cover.id if cover else None,
            "cover_thumbnail_url": f"/api/v1/media/{cover.id}/thumbnail?size=256" if cover else None
        })

    # 2. Trips / Outings
    trips_raw = cluster_events(db, user_id=uid)
    trips = []
    for t in trips_raw:
        trips.append({
            "id": t.get("id"),
            "title": t["title"],
            "date": t["date"],
            "photo_count": t["photo_count"],
            "cover_id": t.get("cover_id"),
            "cover_thumbnail_url": t.get("cover_thumbnail_url"),
            "media_ids": t.get("media_ids", [])
        })

    # 3. People
    people_records = db.query(Person).filter(Person.user_id == uid).all()
    people = []
    for p in people_records:
        photo_ids = set(f.media_id for f in p.faces if f.media_id)
        if not photo_ids:
            continue
        first_face = p.faces[0] if p.faces else None
        people.append({
            "id": p.id,
            "name": p.name,
            "photo_count": len(photo_ids),
            "faces_count": len(p.faces),
            "avatar_url": f"/api/v1/people/{p.id}/avatar",
            "cover_thumbnail_url": f"/api/v1/media/{first_face.media_id}/thumbnail?size=256" if first_face else None
        })
    people.sort(key=lambda x: x["photo_count"], reverse=True)

    # 4. Favorites & Categories
    fav_count = db.query(Media).filter(Media.user_id == uid, Media.is_favorite == True, Media.is_deleted == False).count()
    fav_cover = db.query(Media).filter(Media.user_id == uid, Media.is_favorite == True, Media.is_deleted == False).order_by(desc(Media.captured_at)).first()

    screenshot_count = db.query(Media).filter(Media.user_id == uid, Media.category == MediaCategory.SCREENSHOT, Media.is_deleted == False).count()
    bill_count = db.query(Media).filter(Media.user_id == uid, Media.category == MediaCategory.DOCUMENT_BILL, Media.is_deleted == False).count()
    blurry_count = db.query(Media).filter(Media.user_id == uid, Media.is_blurry == True, Media.is_deleted == False).count()

    return {
        "places": places,
        "trips": trips,
        "people": people,
        "favorites": {
            "count": fav_count,
            "cover_id": fav_cover.id if fav_cover else None,
            "cover_thumbnail_url": f"/api/v1/media/{fav_cover.id}/thumbnail?size=256" if fav_cover else None
        },
        "categories": {
            "screenshots": screenshot_count,
            "receipts_bills": bill_count,
            "blurry": blurry_count
        }
    }

@router.post("/auto-curate")
def auto_curate_albums_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Explicitly triggers auto-curation of smart albums for current user."""
    created = _perform_auto_curate(db, user_id=current_user.id)
    albums = db.query(Album).filter(Album.user_id == current_user.id).order_by(desc(Album.created_at)).all()
    return {
        "status": "success",
        "created_count": len(created),
        "total_albums": len(albums)
    }

@router.get("/available-photos")
def get_available_photos(
    album_id: Optional[int] = None,
    limit: int = Query(300, ge=1, le=1000),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Lists current user's library photos available to add to an album."""
    if not current_user:
        return []

    photos = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.is_deleted == False,
        Media.is_archived == False
    ).order_by(desc(Media.captured_at)).limit(limit).all()

    album_photo_ids = set()
    if album_id:
        album = db.query(Album).filter(Album.id == album_id, Album.user_id == current_user.id).first()
        if album:
            album_photo_ids = {m.id for m in album.media}

    return [{
        "id": p.id,
        "filename": p.filename,
        "captured_at": p.captured_at,
        "location_name": p.location_name,
        "thumbnail_url": f"/api/v1/media/{p.id}/thumbnail?size=256",
        "in_album": p.id in album_photo_ids
    } for p in photos]

@router.get("")
def list_albums(
    auto_curate: bool = Query(True),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Lists all albums for the authenticated user."""
    if not current_user:
        return []

    count = db.query(Album).filter(Album.user_id == current_user.id).count()
    if count == 0 and auto_curate:
        _perform_auto_curate(db, user_id=current_user.id)

    albums = db.query(Album).filter(Album.user_id == current_user.id).order_by(desc(Album.created_at)).all()
    results = []
    
    for a in albums:
        if getattr(a, "is_dynamic", False):
            dyn_photos = resolve_dynamic_album_photos(a, db, user_id=current_user.id)
            photo_count = len(dyn_photos)
            cover_id = a.cover_media_id or (dyn_photos[0].id if dyn_photos else None)
        else:
            user_media = [m for m in a.media if m.user_id == current_user.id and not m.is_deleted]
            photo_count = len(user_media)
            cover_id = a.cover_media_id or (user_media[0].id if user_media else None)

        parsed_rules = None
        if a.rules:
            try:
                parsed_rules = json.loads(a.rules)
            except Exception:
                parsed_rules = None

        results.append({
            "id": a.id,
            "name": a.name,
            "description": a.description,
            "is_dynamic": getattr(a, "is_dynamic", False),
            "rules": parsed_rules,
            "photo_count": photo_count,
            "cover_thumbnail_url": f"/api/v1/media/{cover_id}/thumbnail?size=256" if cover_id else None,
            "created_at": a.created_at
        })
    return results

@router.post("")
def create_album(
    req: CreateAlbumRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Creates a new custom or dynamic smart album belonging to current user."""
    album = Album(
        user_id=current_user.id,
        name=req.name.strip(),
        description=req.description,
        is_dynamic=bool(req.is_dynamic),
        rules=json.dumps(req.rules) if req.rules else None
    )
    db.add(album)
    db.flush()

    if req.is_dynamic:
        dyn_photos = resolve_dynamic_album_photos(album, db, user_id=current_user.id)
        if dyn_photos and not album.cover_media_id:
            album.cover_media_id = dyn_photos[0].id
        photo_count = len(dyn_photos)
    elif req.media_ids:
        photos = db.query(Media).filter(
            Media.id.in_(req.media_ids),
            Media.user_id == current_user.id
        ).all()
        album.media.extend(photos)
        if photos and not album.cover_media_id:
            album.cover_media_id = photos[0].id
        photo_count = len(photos)
    else:
        photo_count = 0

    db.commit()
    db.refresh(album)
    return {
        "id": album.id,
        "name": album.name,
        "is_dynamic": album.is_dynamic,
        "photo_count": photo_count
    }

@router.get("/{album_id}")
def get_album_details(
    album_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Gets album metadata and photos, ensuring account authorization."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    if album.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    if getattr(album, "is_dynamic", False):
        user_photos = resolve_dynamic_album_photos(album, db, user_id=current_user.id)
    else:
        user_photos = [m for m in album.media if m.user_id == current_user.id and not m.is_deleted]

    parsed_rules = None
    if album.rules:
        try:
            parsed_rules = json.loads(album.rules)
        except Exception:
            parsed_rules = None

    return {
        "id": album.id,
        "name": album.name,
        "description": album.description,
        "is_dynamic": getattr(album, "is_dynamic", False),
        "rules": parsed_rules,
        "photo_count": len(user_photos),
        "photos": [{
            "id": m.id,
            "filename": m.filename,
            "category": m.category,
            "width": m.width,
            "height": m.height,
            "captured_at": m.captured_at,
            "is_favorite": m.is_favorite,
            "is_blurry": m.is_blurry,
            "location_name": m.location_name,
            "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256"
        } for m in user_photos]
    }

@router.patch("/{album_id}")
def update_album(
    album_id: int,
    req: UpdateAlbumRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Updates album metadata belonging to current user."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    if album.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    if req.name is not None and req.name.strip():
        album.name = req.name.strip()
    if req.description is not None:
        album.description = req.description
    if req.cover_media_id is not None:
        cover = db.query(Media).filter(Media.id == req.cover_media_id, Media.user_id == current_user.id).first()
        if cover:
            album.cover_media_id = cover.id

    db.commit()
    db.refresh(album)
    return {
        "id": album.id,
        "name": album.name,
        "description": album.description,
        "cover_media_id": album.cover_media_id
    }

@router.post("/{album_id}/photos")
def add_photos_to_album(
    album_id: int,
    req: AddPhotosToAlbumRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Adds user-owned photos to user album."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    if album.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    photos = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        Media.user_id == current_user.id
    ).all()
    for p in photos:
        if p not in album.media:
            album.media.append(p)

    if not album.cover_media_id and album.media:
        album.cover_media_id = album.media[0].id

    db.commit()
    return {"status": "photos_added", "total_photos": len(album.media)}

@router.delete("/{album_id}/photos/{media_id}")
def remove_photo_from_album(
    album_id: int,
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Removes a photo from a user's album without deleting the photo."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    if album.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    photo = db.query(Media).filter(Media.id == media_id, Media.user_id == current_user.id).first()
    if photo and photo in album.media:
        album.media.remove(photo)
        if album.cover_media_id == media_id:
            album.cover_media_id = album.media[0].id if album.media else None
        db.commit()

    return {"status": "photo_removed", "total_photos": len(album.media)}

@router.delete("/{album_id}")
def delete_album(
    album_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deletes an album container belonging to current user."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    if album.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(album)
    db.commit()
    return {"status": "album_deleted", "id": album_id}

@router.post("/export-zip")
def export_album_zip(
    req: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.api.media import bulk_download, BulkDownloadRequest
    download_req = BulkDownloadRequest(
        media_ids=req.get("media_ids", []),
        preset=req.get("preset", "original")
    )
    return bulk_download(download_req, current_user=current_user, db=db)
