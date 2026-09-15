from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.album import Album
from app.models.media import Media

router = APIRouter()

class CreateAlbumRequest(BaseModel):
    name: str
    description: Optional[str] = None
    media_ids: Optional[List[int]] = None

class AddPhotosToAlbumRequest(BaseModel):
    media_ids: List[int]

@router.get("")
def list_albums(db: Session = Depends(get_db)):
    """Lists all user albums with photo counts and cover thumbnail."""
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
            "captured_at": m.captured_at,
            "is_favorite": m.is_favorite,
            "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256"
        } for m in album.media if not m.is_deleted]
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

@router.delete("/{album_id}")
def delete_album(album_id: int, db: Session = Depends(get_db)):
    """Deletes an album container. Photos inside are NOT deleted."""
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    db.delete(album)
    db.commit()
    return {"status": "album_deleted", "id": album_id}
