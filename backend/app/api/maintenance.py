import os
import time
import logging
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text, func

from app.database import get_db
from app.models.user import User
from app.models.media import Media
from app.models.person import Person, FaceDetection
from app.api.auth import get_current_user, get_optional_current_user
from app.services.task_queue import TaskQueue

logger = logging.getLogger("memorypics.maintenance")
router = APIRouter()

class FixActionResponse(BaseModel):
    action: str
    status: str
    message: str
    details: Optional[Dict[str, Any]] = None

@router.get("/health-check")
def get_library_health_check(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Runs a fast diagnostic audit across the entire media archive,
    evaluating indexing completeness, rendition readiness, geolocation density,
    and face clustering cleanliness.
    """
    if not current_user:
        return {"status": "unauthenticated"}

    uid_clause = "m.user_id = :uid AND " if not current_user.is_admin else ""
    p_uid_clause = "p.user_id = :uid AND " if not current_user.is_admin else ""
    params = {"uid": current_user.id}

    total_media = db.execute(text(f"""
        SELECT count(*) FROM media m 
        WHERE {uid_clause}m.is_deleted = false
    """), params).scalar() or 0

    if total_media == 0:
        return {
            "health_score": 100,
            "grade": "A+",
            "status": "healthy",
            "total_media": 0,
            "metrics": {},
            "recommended_actions": []
        }

    total_bytes = db.execute(text(f"""
        SELECT coalesce(sum(file_size), 0) FROM media m 
        WHERE {uid_clause}m.is_deleted = false
    """), params).scalar() or 0

    # Missing CLIP Multimodal Index
    missing_clip = db.execute(text(f"""
        SELECT count(*) FROM media m 
        WHERE {uid_clause}m.is_deleted = false 
          AND NOT EXISTS (
              SELECT 1 FROM media_embeddings me WHERE me.media_id = m.id
          )
    """), params).scalar() or 0

    # Missing GPS Geotags
    missing_gps = db.execute(text(f"""
        SELECT count(*) FROM media m 
        WHERE {uid_clause}m.is_deleted = false AND m.latitude IS NULL
    """), params).scalar() or 0

    # Missing 1080p WebP renditions
    missing_1080 = db.execute(text(f"""
        SELECT count(*) FROM media m 
        WHERE {uid_clause}m.is_deleted = false 
          AND m.thumbnail_1080_path IS NULL 
          AND m.mime_type NOT LIKE 'video/%'
    """), params).scalar() or 0

    # Passerby face clusters (<= 2 faces detected)
    passerby_faces = db.execute(text(f"""
        SELECT count(*) FROM (
            SELECT p.id FROM people p
            JOIN face_detections f ON f.person_id = p.id
            WHERE {p_uid_clause}p.is_hidden = false 
              AND (p.name LIKE 'Person %' OR p.name = 'Unnamed Person')
            GROUP BY p.id HAVING count(f.id) <= 2
        ) sub;
    """), params).scalar() or 0

    # Calculate sub-scores (0 to 100)
    clip_coverage = max(0.0, 1.0 - (missing_clip / total_media))
    rendition_coverage = max(0.0, 1.0 - (missing_1080 / total_media))
    gps_coverage = max(0.0, 1.0 - (missing_gps / total_media))
    passerby_penalty = min(20.0, (passerby_faces / 100.0))

    # Weighted overall health score (0-100)
    # CLIP: 35%, Renditions: 35%, GPS: 20%, Passerby penalty: up to 10%
    score_raw = (clip_coverage * 35.0) + (rendition_coverage * 35.0) + (gps_coverage * 20.0) + 10.0 - passerby_penalty
    health_score = int(max(10, min(100, round(score_raw))))

    if health_score >= 90:
        grade = "A (Optimal)"
    elif health_score >= 75:
        grade = "B (Good - Enrichment Opportunities)"
    elif health_score >= 60:
        grade = "C (Needs Optimization)"
    else:
        grade = "D (Action Required)"

    # Format human-readable storage
    gb = total_bytes / (1024 ** 3)
    storage_str = f"{gb:.2f} GB" if gb >= 1.0 else f"{total_bytes / (1024 ** 2):.1f} MB"

    recommended_actions = []
    if missing_clip > 0:
        recommended_actions.append({
            "action": "clip",
            "title": f"Index {missing_clip:,} Photos with Multimodal CLIP AI",
            "description": "Enables natural language search (e.g. 'sunset at the beach', 'kids birthday cake') across unindexed items.",
            "impact": "high",
            "button_label": "Run CLIP Indexing"
        })

    if missing_gps > 0:
        recommended_actions.append({
            "action": "gps",
            "title": f"Auto-Enrich Geotags for Unmapped Photos",
            "description": "Uses timeline closeness to geotagged phone shots to automatically place DSLR and downloaded photos on the map.",
            "impact": "medium",
            "button_label": "Interpolate Locations"
        })

    if passerby_faces > 0:
        recommended_actions.append({
            "action": "passerby",
            "title": f"Hide {passerby_faces:,} Passerby Crowd Faces",
            "description": "Unclutters the People studio by hiding unnamed face clusters that appear in only 1 or 2 background frames.",
            "impact": "medium",
            "button_label": "Clean Up Crowd Faces"
        })

    if missing_1080 > 0:
        recommended_actions.append({
            "action": "renditions",
            "title": f"Pre-Generate {missing_1080:,} High-Definition 1080p Renditions",
            "description": "Accelerates instant full-screen lightbox viewing by caching compressed 1080p WebP renditions.",
            "impact": "low",
            "button_label": "Pre-Generate Renditions"
        })

    return {
        "health_score": health_score,
        "grade": grade,
        "total_media": total_media,
        "total_storage": storage_str,
        "total_bytes": total_bytes,
        "metrics": {
            "missing_clip": missing_clip,
            "indexed_clip": total_media - missing_clip,
            "missing_gps": missing_gps,
            "geotagged": total_media - missing_gps,
            "missing_1080p": missing_1080,
            "ready_1080p": total_media - missing_1080,
            "passerby_face_clusters": passerby_faces
        },
        "recommended_actions": recommended_actions
    }

@router.post("/fix/{action}", response_model=FixActionResponse)
def execute_remedy_action(
    action: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Executes a 1-click remedy action for an identified library health issue."""
    if action == "clip":
        task = TaskQueue.enqueue("clip_index_all", payload={"user_id": current_user.id})
        return FixActionResponse(
            action=action,
            status="enqueued",
            message="Background CLIP multimodal indexing task enqueued.",
            details={"task_id": task.get("id")}
        )
    elif action == "gps":
        from app.api.media import interpolate_locations
        res = interpolate_locations(window_hours=2.0, preview=False, limit=None, current_user=current_user, db=db)
        return FixActionResponse(
            action=action,
            status="completed",
            message=f"Successfully auto-geotagged {res.get('matched_count', 0)} photos from timeline proximity.",
            details=res
        )
    elif action == "passerby":
        from app.api.people import hide_passerby_faces
        res = hide_passerby_faces(max_faces=2, unnamed_only=True, current_user=current_user, db=db)
        return FixActionResponse(
            action=action,
            status="completed",
            message=f"Successfully hidden {res.get('hidden_count', 0)} passerby face clusters.",
            details=res
        )
    elif action == "renditions":
        task = TaskQueue.enqueue("pregenerate_1080p_renditions", payload={"user_id": current_user.id})
        return FixActionResponse(
            action=action,
            status="enqueued",
            message="Background 1080p WebP rendition pre-generation enqueued.",
            details={"task_id": task.get("id")}
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown remedy action '{action}'. Valid actions: clip, gps, passerby, renditions."
        )
