from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc

from app.database import get_db
from app.models.media import Media, MediaCategory, MediaEmbedding
from app.models.person import FaceDetection, Person
from app.services.event_clustering import cluster_events
from app.services.clip_engine import semantic_search, index_all_unindexed

router = APIRouter()

@router.get("")
def search_photos(
    q: Optional[str] = Query(None, description="Search query: keyword, semantic concept, category, camera, or text"),
    semantic: bool = Query(False, description="Enable offline ONNX CLIP semantic vector search"),
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
    - Offline ONNX CLIP Semantic Natural Language Search (e.g. 'sunset at beach', 'green grass', 'car on street').
    - Keyword matching across filenames, OCR text, camera models, and locations.
    - Person filtering.
    - Category & date range filtering.
    """
    # If semantic search is explicitly requested and query is present
    if semantic and q and q.strip():
        semantic_results = semantic_search(db, q.strip(), top_k=limit)
        if category:
            semantic_results = [r for r in semantic_results if r["category"] == category]
        return {
            "total": len(semantic_results),
            "query": q,
            "is_semantic": True,
            "results": semantic_results
        }

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

    # If traditional keyword search returns 0 results for a non-empty phrase, auto-try semantic search fallback
    if total == 0 and q and len(q.strip()) >= 3:
        fallback_semantic = semantic_search(db, q.strip(), top_k=limit)
        if fallback_semantic:
            return {
                "total": len(fallback_semantic),
                "query": q,
                "is_semantic": True,
                "auto_semantic_fallback": True,
                "results": fallback_semantic
            }

    return {
        "total": total,
        "query": q,
        "is_semantic": False,
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

@router.post("/index-embeddings")
def index_embeddings(limit: int = Query(500, ge=1, le=1000), db: Session = Depends(get_db)):
    """Indexes all unindexed media files with offline ONNX CLIP embeddings."""
    indexed_count = index_all_unindexed(db, limit=limit)
    total_indexed = db.query(MediaEmbedding).count()
    total_photos = db.query(Media).filter(Media.is_deleted == False).count()
    return {
        "status": "success",
        "newly_indexed": indexed_count,
        "total_indexed": total_indexed,
        "total_photos": total_photos
    }

@router.get("/ai-status")
def get_ai_status(db: Session = Depends(get_db)):
    """Returns status of CLIP semantic search index."""
    total_indexed = db.query(MediaEmbedding).count()
    total_photos = db.query(Media).filter(Media.is_deleted == False).count()
    return {
        "is_indexed": total_indexed > 0,
        "total_indexed": total_indexed,
        "total_photos": total_photos,
        "coverage_percent": round((total_indexed / max(1, total_photos)) * 100, 1)
    }

@router.get("/events")
def get_events(db: Session = Depends(get_db)):
    """Returns detected spatiotemporal events / outing stories."""
    events = cluster_events(db)
    return events
