from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.database import get_db
from app.models.album import Album
from app.models.media import Media, MediaCategory
from app.models.person import Person, FaceDetection
from app.services.event_clustering import cluster_events

router = APIRouter()

class CreateAlbumRequest(BaseModel):
    name: str
    description: Optional[str] = None
    media_ids: Optional[List[int]] = None

class UpdateAlbumRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cover_media_id: Optional[int] = None

class AddPhotosToAlbumRequest(BaseModel):
    media_ids: List[int]

def _perform_auto_curate(db: Session) -> List[Album]:
    """Helper to auto-generate smart albums based on places and events."""
    created_albums = []
    
    # 1. Curate from prominent places (>= 3 photos)
    places = db.query(
        Media.location_name,
        func.count(Media.id).label("cnt")
    ).filter(
        Media.is_deleted == False,
        Media.location_name != None
    ).group_by(Media.location_name).having(func.count(Media.id) >= 3).all()

    for place_name, cnt in places:
        city = place_name.split(",")[0].strip()
        album_name = f"{city} Memories"
        
        # Check if already exists
        existing = db.query(Album).filter(Album.name == album_name).first()
        if existing:
            continue

        photos = db.query(Media).filter(
            Media.is_deleted == False,
            Media.location_name == place_name
        ).order_by(desc(Media.captured_at)).all()

        if photos:
            sharp_cover = next((p for p in photos if not p.is_blurry), photos[0])
            album = Album(
                name=album_name,
                description=f"Curated collection of {len(photos)} memories from {place_name}.",
                cover_media_id=sharp_cover.id
            )
            album.media.extend(photos)
            db.add(album)
            created_albums.append(album)

    # 2. Curate from prominent spatiotemporal trips / outings (>= 10 photos)
    trips = cluster_events(db)
    for trip in trips:
        if trip["photo_count"] >= 10:
            trip_title = trip["title"]
            album_name = f"Trip: {trip_title}"
            existing = db.query(Album).filter(Album.name == album_name).first()
            if existing:
                continue

            trip_photos = db.query(Media).filter(Media.id.in_(trip["media_ids"])).all()
            if trip_photos:
                album = Album(
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
def get_smart_collections(db: Session = Depends(get_db)):
    """
    Returns auto-computed smart collections:
    - Places (grouped by location_name)
    - Trips (spatiotemporal outings)
    - People (detected individuals)
    - Favorites & Categories
    """
    # 1. Places Collections
    places_raw = db.query(
        Media.location_name,
        func.count(Media.id).label("photo_count")
    ).filter(
        Media.is_deleted == False,
        Media.location_name != None
    ).group_by(Media.location_name).order_by(desc("photo_count")).all()

    places = []
    for loc_name, count in places_raw:
        # Find best cover photo (sharpest / recent)
        cover = db.query(Media).filter(
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
    trips_raw = cluster_events(db)
    trips = []
    for t in trips_raw:
        trips.append({
            "title": t["title"],
            "date": t["date"],
            "photo_count": t["photo_count"],
            "cover_id": t.get("cover_id"),
            "cover_thumbnail_url": t.get("cover_thumbnail_url"),
            "media_ids": t.get("media_ids", [])
        })

    # 3. People
    people_records = db.query(Person).all()
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
    fav_count = db.query(Media).filter(Media.is_favorite == True, Media.is_deleted == False).count()
    fav_cover = db.query(Media).filter(Media.is_favorite == True, Media.is_deleted == False).order_by(desc(Media.captured_at)).first()

    screenshot_count = db.query(Media).filter(Media.category == MediaCategory.SCREENSHOT, Media.is_deleted == False).count()
    bill_count = db.query(Media).filter(Media.category == MediaCategory.DOCUMENT_BILL, Media.is_deleted == False).count()
    blurry_count = db.query(Media).filter(Media.is_blurry == True, Media.is_deleted == False).count()

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
def auto_curate_albums_endpoint(db: Session = Depends(get_db)):
    """Explicitly triggers auto-curation of smart albums from trips & places."""
    created = _perform_auto_curate(db)
    albums = db.query(Album).order_by(desc(Album.created_at)).all()
    return {
        "status": "success",
        "created_count": len(created),
        "total_albums": len(albums)
    }

@router.get("/available-photos")
def get_available_photos(
    album_id: Optional[int] = None,
    limit: int = Query(300, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """
    Lists library photos to add to an album.
    If album_id is provided, includes `in_album: bool`.
    """
    photos = db.query(Media).filter(
        Media.is_deleted == False,
        Media.is_archived == False
    ).order_by(desc(Media.captured_at)).limit(limit).all()

    album_photo_ids = set()
    if album_id:
        album = db.query(Album).filter(Album.id == album_id).first()
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
def list_albums(auto_curate: bool = Query(True), db: Session = Depends(get_db)):
    """Lists all user albums with photo counts and cover thumbnail."""
    count = db.query(Album).count()
    if count == 0 and auto_curate:
        _perform_auto_curate(db)

    albums = db.query(Album).order_by(desc(Album.created_at)).all()
    results = []
    
    for a in albums:
        count = len(a.media)
        cover_id = a.cover_media_id or (a.media[0].id if a.media else None)
        results.append({
            "id": a.id,
            "name": a.name,
            "description": a.description,
            "photo_count": count,
            "cover_thumbnail_url": f"/api/v1/media/{cover_id}/thumbnail?size=256" if cover_id else None,
            "created_at": a.created_at
        })
    return results

@router.post("")
def create_album(req: CreateAlbumRequest, db: Session = Depends(get_db)):
    """Creates a new album and optionally adds initial photos."""
    album = Album(name=req.name.strip(), description=req.description)
    db.add(album)
    db.flush()

    if req.media_ids:
        photos = db.query(Media).filter(Media.id.in_(req.media_ids)).all()
        album.media.extend(photos)
        if photos and not album.cover_media_id:
            album.cover_media_id = photos[0].id

    db.commit()
    db.refresh(album)
    return {
        "id": album.id,
        "name": album.name,
        "photo_count": len(album.media)
    }

@router.get("/{album_id}")
def get_album_details(album_id: int, db: Session = Depends(get_db)):
    """Gets album metadata and all photos in the album."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    return {
        "id": album.id,
        "name": album.name,
        "description": album.description,
        "photo_count": len(album.media),
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
        } for m in album.media if not m.is_deleted]
    }

@router.patch("/{album_id}")
def update_album(album_id: int, req: UpdateAlbumRequest, db: Session = Depends(get_db)):
    """Updates album metadata (name, description, cover photo)."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    if req.name is not None and req.name.strip():
        album.name = req.name.strip()
    if req.description is not None:
        album.description = req.description
    if req.cover_media_id is not None:
        album.cover_media_id = req.cover_media_id

    db.commit()
    db.refresh(album)
    return {
        "id": album.id,
        "name": album.name,
        "description": album.description,
        "cover_media_id": album.cover_media_id
    }

@router.post("/{album_id}/photos")
def add_photos_to_album(album_id: int, req: AddPhotosToAlbumRequest, db: Session = Depends(get_db)):
    """Adds photos to an existing album."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    photos = db.query(Media).filter(Media.id.in_(req.media_ids)).all()
    for p in photos:
        if p not in album.media:
            album.media.append(p)

    if not album.cover_media_id and album.media:
        album.cover_media_id = album.media[0].id

    db.commit()
    return {"status": "photos_added", "total_photos": len(album.media)}

@router.delete("/{album_id}/photos/{media_id}")
def remove_photo_from_album(album_id: int, media_id: int, db: Session = Depends(get_db)):
    """Removes a photo from an album without deleting the photo."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    photo = db.query(Media).filter(Media.id == media_id).first()
    if photo and photo in album.media:
        album.media.remove(photo)
        if album.cover_media_id == media_id:
            album.cover_media_id = album.media[0].id if album.media else None
        db.commit()

    return {"status": "photo_removed", "total_photos": len(album.media)}

@router.delete("/{album_id}")
def delete_album(album_id: int, db: Session = Depends(get_db)):
    """Deletes an album container. Photos inside are NOT deleted."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    db.delete(album)
    db.commit()
    return {"status": "album_deleted", "id": album_id}
