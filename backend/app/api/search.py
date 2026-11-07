from typing import Optional, List, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc, func

from app.database import get_db
from app.models.user import User
from app.models.media import Media, MediaCategory, MediaEmbedding, VideoKeyframe
from app.models.person import FaceDetection, Person
from app.api.auth import get_current_user, get_optional_current_user
from app.services.event_clustering import cluster_events
from app.services.clip_engine import semantic_search, index_all_unindexed, embed_text
from app.services.mood_engine import analyze_media_mood, analyze_all_media_moods
from app.services.video_engine import search_video_keyframes, extract_video_keyframes, is_video_file

router = APIRouter()

@router.get("")
def search_photos(
    q: Optional[str] = Query(None, description="Search query: keyword, semantic concept, category, camera, or text"),
    semantic: bool = Query(False, description="Enable offline ONNX CLIP semantic vector search"),
    category: Optional[MediaCategory] = None,
    person_id: Optional[int] = None,
    mood: Optional[str] = Query(None, description="Filter by emotion/mood: joyful, serene, celebratory, adventurous, cozy, dramatic, romantic, nostalgic"),
    smiling_only: Optional[bool] = Query(None, description="Filter for photos with smiling faces"),
    dominant_color: Optional[str] = Query(None, description="Filter by dominant color: blue, green, gold, red, orange, purple, monochrome, vibrant"),
    media_type: Optional[str] = Query(None, description="Media type filter: 'all', 'photo', 'video'"),
    is_favorite: Optional[bool] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Advanced multi-faceted AI search strictly scoped to the authenticated user's account.
    Returns empty results for unauthenticated guest requests to eliminate data leaks.
    """
    if not current_user:
        return {
            "total": 0,
            "query": q,
            "is_semantic": False,
            "results": []
        }

    # 1. AI Semantic Natural Language Search (Photos + Video Keyframes)
    if semantic and q and q.strip():
        # A. Semantic search across photos
        photo_results = semantic_search(db, q.strip(), top_k=limit)
        
        # B. Video keyframe search
        q_vec = embed_text(q.strip())
        video_results = []
        if q_vec is not None:
            video_results = search_video_keyframes(db, q_vec, top_k=15)

        # Merge results, strictly enforcing current_user.id ownership via single batch query (eliminating N+1)
        all_candidate_ids = list(set([p["id"] for p in photo_results] + [v["id"] for v in video_results]))
        media_map = {}
        if all_candidate_ids:
            found_records = db.query(Media).filter(
                Media.id.in_(all_candidate_ids),
                Media.user_id == current_user.id,
                Media.is_deleted == False
            ).all()
            media_map = {m.id: m for m in found_records}

        all_results = []
        for p in photo_results:
            p_media = media_map.get(p["id"])
            if not p_media:
                continue
            all_results.append({
                **p,
                "is_video": False,
                "mood": p_media.mood,
                "mood_score": p_media.mood_score or 0.0,
                "is_smiling": p_media.is_smiling or False,
                "dominant_color": p_media.dominant_color,
                "color_hex": p_media.color_hex,
                "duration_seconds": None,
                "matched_timestamp": None,
                "matched_timestamp_label": None
            })

        for v in video_results:
            v_media = media_map.get(v["id"])
            if not v_media:
                continue
            all_results.append({
                **v,
                "mood": v_media.mood,
                "mood_score": v_media.mood_score or 0.0,
                "is_smiling": v_media.is_smiling or False,
                "dominant_color": v_media.dominant_color,
                "color_hex": v_media.color_hex,
            })

        # Apply multi-attribute filters on semantic results
        if category:
            all_results = [r for r in all_results if r.get("category") == category]
        if mood:
            all_results = [r for r in all_results if r.get("mood") == mood.lower()]
        if smiling_only:
            all_results = [r for r in all_results if r.get("is_smiling") == True]
        if dominant_color:
            all_results = [r for r in all_results if r.get("dominant_color") == dominant_color.lower()]
        if media_type == "photo":
            all_results = [r for r in all_results if not r.get("is_video")]
        elif media_type == "video":
            all_results = [r for r in all_results if r.get("is_video")]

        all_results.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)

        return {
            "total": len(all_results),
            "query": q,
            "is_semantic": True,
            "results": all_results[:limit]
        }

    # 2. Database Multi-Attribute Filtering (Keyword / Mood / Color / Category)
    query = db.query(Media).filter(
        Media.user_id == current_user.id,
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
                Media.extracted_text.ilike(search_term),
                Media.mood.ilike(search_term)
            )
        )

    if category:
        query = query.filter(Media.category == category)

    if mood:
        query = query.filter(Media.mood == mood.lower())

    if smiling_only:
        query = query.filter(Media.is_smiling == True)

    if dominant_color:
        query = query.filter(Media.dominant_color == dominant_color.lower())

    if media_type == "video":
        query = query.filter(Media.mime_type.like("video/%"))
    elif media_type == "photo":
        query = query.filter(~Media.mime_type.like("video/%"))

    if is_favorite is not None:
        query = query.filter(Media.is_favorite == is_favorite)

    if from_date:
        query = query.filter(Media.captured_at >= from_date)

    if to_date:
        query = query.filter(Media.captured_at <= to_date)

    if person_id:
        media_ids_subquery = db.query(FaceDetection.media_id).filter(
            FaceDetection.person_id == person_id
        ).subquery()
        query = query.filter(Media.id.in_(media_ids_subquery))

    total = query.count()
    items = query.order_by(desc(Media.captured_at)).offset(offset).limit(limit).all()

    # If traditional keyword search returns 0 results for a non-empty phrase, auto-try semantic search fallback
    if total == 0 and q and len(q.strip()) >= 3:
        fallback_semantic = semantic_search(db, q.strip(), top_k=limit)
        filtered_fallback = []
        if fallback_semantic:
            cand_ids = [it["id"] for it in fallback_semantic]
            allowed_ids = set(
                r[0] for r in db.query(Media.id).filter(
                    Media.id.in_(cand_ids),
                    Media.user_id == current_user.id,
                    Media.is_deleted == False
                ).all()
            )
            filtered_fallback = [it for it in fallback_semantic if it["id"] in allowed_ids]
        if filtered_fallback:
            return {
                "total": len(filtered_fallback),
                "query": q,
                "is_semantic": True,
                "auto_semantic_fallback": True,
                "results": filtered_fallback
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
            "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256",
            "is_video": (m.mime_type or "").startswith("video/"),
            "duration_seconds": m.duration_seconds,
            "mood": m.mood,
            "mood_score": m.mood_score,
            "is_smiling": m.is_smiling,
            "dominant_color": m.dominant_color,
            "color_hex": m.color_hex,
            "source_type": (m.source_type.value if hasattr(m.source_type, "value") else str(m.source_type)) if m.source_type else "local",
            "source_id": m.source_id
        } for m in items]
    }

@router.get("/moods")
def get_mood_stats(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Returns library-wide mood distribution and smiling face counts for current user."""
    if not current_user:
        return {"total_analyzed": 0, "smiling_count": 0, "moods": {}}

    rows = db.query(Media.mood, func.count(Media.id)).filter(
        Media.user_id == current_user.id,
        Media.is_deleted == False,
        Media.mood.isnot(None)
    ).group_by(Media.mood).all()

    smiling_count = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.is_deleted == False,
        Media.is_smiling == True
    ).count()

    mood_counts = {r[0]: r[1] for r in rows if r[0]}
    total_analyzed = sum(mood_counts.values())

    return {
        "total_analyzed": total_analyzed,
        "smiling_count": smiling_count,
        "moods": mood_counts
    }

@router.get("/colors")
def get_color_stats(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Returns library-wide color palette counts for current user."""
    if not current_user:
        return {}

    rows = db.query(Media.dominant_color, func.count(Media.id)).filter(
        Media.user_id == current_user.id,
        Media.is_deleted == False,
        Media.dominant_color.isnot(None)
    ).group_by(Media.dominant_color).all()

    return {r[0]: r[1] for r in rows if r[0]}

@router.post("/analyze-moods")
def trigger_mood_analysis(
    limit: int = Query(200, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Triggers batch emotion, mood, and color palette analysis across user library photos."""
    res = analyze_all_media_moods(db, limit=limit)
    return res

@router.post("/index-videos")
def trigger_video_indexing(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Extracts keyframes and computes CLIP visual embeddings for user video files."""
    videos = db.query(Media).filter(
        Media.user_id == current_user.id,
        Media.is_deleted == False,
        Media.mime_type.like("video/%")
    ).all()

    indexed_count = 0
    total_keyframes = 0
    for v in videos:
        kfs = extract_video_keyframes(db, v)
        if kfs:
            indexed_count += 1
            total_keyframes += len(kfs)

    return {
        "status": "completed",
        "videos_processed": indexed_count,
        "total_keyframes": total_keyframes
    }

@router.post("/index-embeddings")
def index_embeddings(
    limit: int = Query(500, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Indexes all unindexed media files with offline ONNX CLIP embeddings."""
    indexed_count = index_all_unindexed(db, limit=limit)
    total_indexed = db.query(MediaEmbedding).join(Media, MediaEmbedding.media_id == Media.id).filter(Media.user_id == current_user.id).count()
    total_photos = db.query(Media).filter(Media.user_id == current_user.id, Media.is_deleted == False).count()
    return {
        "status": "success",
        "newly_indexed": indexed_count,
        "total_indexed": total_indexed,
        "total_photos": total_photos
    }

@router.get("/ai-status")
def get_ai_status(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Returns status of CLIP semantic search index and video keyframe index for current user."""
    if not current_user:
        return {
            "is_indexed": False,
            "total_indexed": 0,
            "total_photos": 0,
            "total_keyframes": 0,
            "total_videos": 0,
            "coverage_percent": 0.0
        }

    total_photos = db.query(Media).filter(Media.user_id == current_user.id, Media.is_deleted == False).count()
    total_indexed = db.query(MediaEmbedding).join(Media, MediaEmbedding.media_id == Media.id).filter(Media.user_id == current_user.id).count()
    total_keyframes = db.query(VideoKeyframe).join(Media, VideoKeyframe.media_id == Media.id).filter(Media.user_id == current_user.id).count()
    total_videos = db.query(Media).filter(Media.user_id == current_user.id, Media.is_deleted == False, Media.mime_type.like("video/%")).count()

    return {
        "is_indexed": total_indexed > 0,
        "total_indexed": total_indexed,
        "total_photos": total_photos,
        "total_keyframes": total_keyframes,
        "total_videos": total_videos,
        "coverage_percent": round((total_indexed / max(1, total_photos)) * 100, 1)
    }

@router.get("/events")
def get_events(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns detected spatiotemporal events / outing stories strictly for the authenticated user.
    Guests receive an empty list with zero metadata leakage.
    """
    if not current_user:
        return []
    events = cluster_events(db, user_id=current_user.id)
    return events
