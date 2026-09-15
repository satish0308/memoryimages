from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc

from app.database import get_db
from app.models.media import Media, MediaCategory
from app.models.person import FaceDetection, Person
from app.services.event_clustering import cluster_events

router = APIRouter()

@router.get("")
def search_photos(
    q: Optional[str] = Query(None, description="Search query: keyword, category, camera, or text"),
    category: Optional[MediaCategory] = None,
    person_id: Optional[int] = None,
    is_favorite: Optional[bool] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Advanced multi-faceted search:
    - Text matching across filenames, OCR text, camera models, and locations.
    - Person filtering.
    - Category & date range filtering.
    """
    query = db.query(Media).filter(
        Media.is_deleted == False,
        Media.is_archived == False
    )

    if q:
        search_term = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                Media.filename.ilike(search_term),
                Media.camera_make.ilike(search_term),
                Media.camera_model.ilike(search_term),
                Media.location_name.ilike(search_term),
                Media.extracted_text.ilike(search_term)
            )
        )

    if category:
        query = query.filter(Media.category == category)

    if is_favorite is not None:
        query = query.filter(Media.is_favorite == is_favorite)

    if from_date:
        query = query.filter(Media.captured_at >= from_date)

    if to_date:
        query = query.filter(Media.captured_at <= to_date)

    if person_id:
        # Join with FaceDetection
        media_ids_subquery = db.query(FaceDetection.media_id).filter(
            FaceDetection.person_id == person_id
        ).subquery()
        query = query.filter(Media.id.in_(media_ids_subquery))

    total = query.count()
    items = query.order_by(desc(Media.captured_at)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "query": q,
        "results": [{
            "id": m.id,
            "filename": m.filename,
            "category": m.category,
            "captured_at": m.captured_at,
            "is_favorite": m.is_favorite,
            "is_blurry": m.is_blurry,
            "camera_model": m.camera_model,
            "location_name": m.location_name,
            "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256"
        } for m in items]
    }

@router.get("/events")
def get_events(db: Session = Depends(get_db)):
    """Returns detected spatiotemporal events / outing stories."""
    events = cluster_events(db)
    return events
