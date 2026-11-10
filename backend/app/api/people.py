import logging
import io
import os
import base64
from typing import List, Optional, Dict, Any
import numpy as np
from PIL import Image
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

logger = logging.getLogger(__name__)

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.person import Person, FaceDetection
from app.models.media import Media
from app.api.auth import get_current_user, get_optional_current_user
from app.services.task_queue import TaskQueue
from app.services.face_engine import (
    process_faces_for_media, 
    index_all_library_faces,
    get_face_crop_image,
    auto_cluster_faces,
    load_media_image,
    extract_arcface_embedding,
    align_face_crop,
    detect_faces_in_image
)

router = APIRouter()

class PersonUpdateRequest(BaseModel):
    name: Optional[str] = None
    relationship_type: Optional[str] = None
    is_hidden: Optional[bool] = None

class SetCoverRequest(BaseModel):
    media_id: int

class SearchFaceRequest(BaseModel):
    face_id: Optional[int] = None
    media_id: Optional[int] = None
    box_x: Optional[float] = None
    box_y: Optional[float] = None
    box_w: Optional[float] = None
    box_h: Optional[float] = None
    similarity_threshold: Optional[float] = 0.38

class GroupMatchedFacesRequest(BaseModel):
    person_name: str
    person_id: Optional[int] = None
    relationship_type: Optional[str] = None
    face_ids: List[int] = []
    media_ids: List[int] = []
    query_face_id: Optional[int] = None
    set_as_cover: bool = True
    cover_media_id: Optional[int] = None

class MergePeopleRequest(BaseModel):
    source_person_id: int
    target_person_id: int

class TagFaceRequest(BaseModel):
    box_x: float
    box_y: float
    box_w: float
    box_h: float
    person_name: str

class UpdateFaceTagRequest(BaseModel):
    person_name: str

@router.get("")
def list_people(
    filter_type: str = Query("all", regex="^(all|people|pets)$"),
    relationship: Optional[str] = Query(None),
    show_hidden: bool = Query(False),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Lists identified people & pets for current user along with photo counts and avatar crops."""
    if not current_user:
        return []

    query = db.query(Person).filter(
        (Person.user_id == current_user.id) | (Person.user_id == None)
    )
    if not show_hidden:
        query = query.filter(Person.is_hidden == False)
    else:
        query = query.filter(Person.is_hidden == True)

    if filter_type == "people":
        query = query.filter(Person.is_pet == False)
    elif filter_type == "pets":
        query = query.filter(Person.is_pet == True)

    if relationship and relationship.lower() != "all":
        query = query.filter(Person.relationship_type.ilike(relationship))

    people = query.all()
    if not people:
        return []

    # Batch retrieve all faces for all matching people in 1 single query (eliminating N+1)
    person_ids = [p.id for p in people]
    all_faces = (
        db.query(FaceDetection.id, FaceDetection.person_id, FaceDetection.media_id)
        .join(Media, FaceDetection.media_id == Media.id)
        .filter(
            FaceDetection.person_id.in_(person_ids),
            (Media.user_id == current_user.id) | (Media.user_id == None),
            Media.is_deleted == False
        ).all()
    )

    faces_by_person: Dict[int, List[Any]] = {}
    for f_id, p_id, m_id in all_faces:
        if p_id not in faces_by_person:
            faces_by_person[p_id] = []
        faces_by_person[p_id].append((f_id, m_id))

    results = []
    for p in people:
        p_faces = faces_by_person.get(p.id, [])
        if not p_faces:
            continue

        unique_media_ids = set(m_id for _, m_id in p_faces)
        first_face = p_faces[0] if p_faces else None
        cover_media_id = p.cover_media_id or (first_face[1] if first_face else None)
        
        results.append({
            "id": p.id,
            "name": p.name,
            "is_pet": bool(p.is_pet),
            "pet_type": p.pet_type,
            "relationship_type": getattr(p, "relationship_type", None),
            "is_hidden": bool(p.is_hidden),
            "cover_media_id": cover_media_id,
            "photo_count": len(unique_media_ids),
            "faces_count": len(p_faces),
            "avatar_url": f"/api/v1/people/{p.id}/avatar" if first_face else None,
            "cover_thumbnail_url": f"/api/v1/media/{cover_media_id}/thumbnail?size=256" if cover_media_id else None
        })
    return sorted(results, key=lambda x: x["photo_count"], reverse=True)

@router.get("/stats")
def get_people_stats(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Returns face detection, people, and pets statistics for current user."""
    if not current_user:
        return {
            "total_faces": 0,
            "total_people": 0,
            "total_pets": 0,
            "tagged_faces": 0,
            "unassigned_faces": 0,
            "photos_with_faces": 0
        }

    uid = current_user.id
    total_faces = (
        db.query(FaceDetection)
        .join(Media, FaceDetection.media_id == Media.id)
        .filter((Media.user_id == uid) | (Media.user_id == None), Media.is_deleted == False)
        .count()
    )
    total_people = (
        db.query(func.count(func.distinct(Person.id)))
        .join(FaceDetection, FaceDetection.person_id == Person.id)
        .join(Media, FaceDetection.media_id == Media.id)
        .filter((Person.user_id == uid) | (Person.user_id == None), Person.is_hidden == False, Person.is_pet == False, Media.is_deleted == False)
        .scalar() or 0
    )
    total_pets = (
        db.query(func.count(func.distinct(Person.id)))
        .join(FaceDetection, FaceDetection.person_id == Person.id)
        .join(Media, FaceDetection.media_id == Media.id)
        .filter((Person.user_id == uid) | (Person.user_id == None), Person.is_hidden == False, Person.is_pet == True, Media.is_deleted == False)
        .scalar() or 0
    )
    tagged_faces = (
        db.query(FaceDetection)
        .join(Media, FaceDetection.media_id == Media.id)
        .filter(FaceDetection.person_id != None, (Media.user_id == uid) | (Media.user_id == None), Media.is_deleted == False)
        .count()
    )
    photos_with_faces = (
        db.query(func.count(func.distinct(FaceDetection.media_id)))
        .join(Media, FaceDetection.media_id == Media.id)
        .filter((Media.user_id == uid) | (Media.user_id == None), Media.is_deleted == False)
        .scalar() or 0
    )
    return {
        "total_faces": total_faces,
        "total_people": total_people,
        "total_pets": total_pets,
        "tagged_faces": tagged_faces,
        "unassigned_faces": total_faces - tagged_faces,
        "photos_with_faces": photos_with_faces
    }

@router.get("/unnamed-faces")
def get_unnamed_faces(
    limit: int = 60,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Returns detected faces that are not assigned to a named person for current user."""
    if not current_user:
        return []

    rows = (
        db.query(FaceDetection, Media.filename, Media.captured_at, Person.name)
        .join(Media, FaceDetection.media_id == Media.id)
        .outerjoin(Person, FaceDetection.person_id == Person.id)
        .filter(
            (Media.user_id == current_user.id) | (Media.user_id == None),
            Media.is_deleted == False,
            (FaceDetection.person_id == None) | (Person.name.like("Person %")) | (Person.name == "Unnamed Person")
        )
        .limit(limit)
        .all()
    )
    results = []
    for f, m_filename, m_captured_at, p_name in rows:
        results.append({
            "id": f.id,
            "media_id": f.media_id,
            "filename": m_filename or "Unknown",
            "captured_at": m_captured_at,
            "person_id": f.person_id,
            "person_name": p_name or "Unnamed",
            "crop_url": f"/api/v1/people/faces/{f.id}/crop",
            "confidence": f.confidence
        })
    return results

@router.post("/auto-cluster")
def trigger_auto_cluster(
    background: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Auto-clusters detected faces into Person groups using ArcFace 512-d embeddings."""
    if background:
        task = TaskQueue.enqueue(
            task_type="face_cluster_all",
            payload={"user_id": current_user.id},
            name="Vision Person Face Clustering"
        )
        return {"status": "queued", "task_id": task["id"]}
    res = auto_cluster_faces(db, user_id=current_user.id)
    return res

@router.post("/scan-faces")
def scan_faces(
    max_photos: int = Query(250, ge=1, le=1000),
    force: bool = Query(False),
    background: bool = Query(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deep scans library photos for human faces (UltraFace + ArcFace) and household pets (YOLOv8)."""
    unscanned_q = db.query(Media).filter(
        Media.is_deleted == False,
        (Media.mime_type == None) | (~Media.mime_type.startswith("video/")),
        (Media.faces_scanned == False) | (Media.faces_scanned == None)
    )
    if current_user:
        unscanned_q = unscanned_q.filter(Media.user_id == current_user.id)
    unscanned_count = unscanned_q.count()

    if unscanned_count == 0 and not force:
        return {
            "status": "already_up_to_date",
            "task_id": None,
            "message": "All photos in your library have already been scanned for faces.",
            "photos_processed": 0,
            "faces_detected": 0
        }

    if background:
        task = TaskQueue.enqueue(
            task_type="face_detect_all",
            payload={"user_id": current_user.id, "max_photos": max_photos, "force": force},
            name="UltraFace Face Detection"
        )
        return {
            "status": "queued",
            "task_id": task["id"],
            "message": "Face detection background task started.",
            "photos_processed": 0,
            "faces_detected": 0
        }
    scan_res = index_all_library_faces(db, user_id=current_user.id, max_photos=max_photos)
    cluster_res = auto_cluster_faces(db, user_id=current_user.id)
    return {
        **scan_res,
        "clustering": cluster_res
    }

@router.delete("/faces/{face_id}")
def delete_face_detection(
    face_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deletes an incorrect or unwanted face detection."""
    face = db.query(FaceDetection).join(Media, FaceDetection.media_id == Media.id).filter(
        FaceDetection.id == face_id,
        (Media.user_id == current_user.id) | (current_user.is_admin == True)
    ).first()
    if not face:
        raise HTTPException(status_code=404, detail="Face detection not found")
    db.delete(face)
    db.commit()
    return {"status": "deleted", "id": face_id}

@router.get("/faces/{face_id}/crop")
def get_face_crop(
    face_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Returns a square WebP face crop avatar for a specific face detection with disk caching and 1-year browser cache."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    face_cache_path = os.path.join(settings.THUMBNAIL_DIR, f"face_{face_id}_180.webp")
    if os.path.isfile(face_cache_path):
        return FileResponse(
            face_cache_path,
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=31536000, immutable"}
        )

    face = db.query(FaceDetection).join(Media, FaceDetection.media_id == Media.id).filter(
        FaceDetection.id == face_id,
        (Media.user_id == current_user.id) | (current_user.is_admin == True)
    ).first()
    if not face:
        raise HTTPException(status_code=404, detail="Face detection not found or access denied")
        
    crop_bytes = get_face_crop_image(db, face)
    if not crop_bytes:
        raise HTTPException(status_code=404, detail="Could not generate face crop")

    if os.path.isfile(face_cache_path):
        return FileResponse(
            face_cache_path,
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=31536000, immutable"}
        )

    return Response(
        content=crop_bytes, 
        media_type="image/webp", 
        headers={"Cache-Control": "public, max-age=31536000, immutable"}
    )

@router.get("/merge-suggestions")
def get_merge_suggestions(
    similarity_threshold: float = Query(0.40, ge=0.25, le=0.90),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Computes ArcFace centroid embeddings for all identified people and recommends
    pairs that are likely the exact same person.
    """
    if not current_user:
        return []

    people_query = db.query(Person).filter(
        Person.is_hidden == False
    )
    if not current_user.is_admin:
        people_query = people_query.filter((Person.user_id == current_user.id) | (Person.user_id == None))
    people = people_query.all()

    people_ids = [p.id for p in people]
    if not people_ids:
        return []

    # Single batch query for all faces across all identified people
    faces_query = (
        db.query(FaceDetection.person_id, FaceDetection.media_id, FaceDetection.embedding_str)
        .join(Media, FaceDetection.media_id == Media.id)
        .filter(
            FaceDetection.person_id.in_(people_ids),
            Media.is_deleted == False,
            FaceDetection.embedding_str != None
        )
    )
    if not current_user.is_admin:
        faces_query = faces_query.filter((Media.user_id == current_user.id) | (Media.user_id == None))
    all_faces = faces_query.all()

    faces_by_pid = {}
    for pid, mid, emb_str in all_faces:
        faces_by_pid.setdefault(pid, []).append((mid, emb_str))

    centroids = {}
    person_info = {}

    for p in people:
        p_faces = faces_by_pid.get(p.id, [])
        if not p_faces:
            continue

        embs = []
        for mid, emb_str in p_faces:
            try:
                embs.append(np.array([float(x) for x in emb_str.split(",")]))
            except Exception:
                pass
        if not embs:
            continue

        centroid = np.mean(embs, axis=0)
        norm = np.linalg.norm(centroid)
        if norm > 0:
            centroids[p.id] = centroid / norm
            first_mid = p_faces[0][0]
            cover_id = p.cover_media_id or first_mid
            person_info[p.id] = {
                "id": p.id,
                "name": p.name,
                "relationship_type": getattr(p, "relationship_type", None),
                "faces_count": len(p_faces),
                "avatar_url": f"/api/v1/people/{p.id}/avatar",
                "cover_thumbnail_url": f"/api/v1/media/{cover_id}/thumbnail?size=256" if cover_id else None
            }

    p_ids = list(centroids.keys())
    suggestions = []

    for i in range(len(p_ids)):
        for j in range(i + 1, len(p_ids)):
            pid1, pid2 = p_ids[i], p_ids[j]
            sim = float(np.dot(centroids[pid1], centroids[pid2]))
            if sim >= similarity_threshold:
                p1 = person_info[pid1]
                p2 = person_info[pid2]

                def is_named(name: str):
                    clean = name.strip().lower()
                    return clean not in ("unnamed", "unnamed person", "unknown") and not (clean.startswith("person ") and clean[7:].isdigit())

                if is_named(p1["name"]) and not is_named(p2["name"]):
                    target, source = p1, p2
                elif is_named(p2["name"]) and not is_named(p1["name"]):
                    target, source = p2, p1
                elif p1["faces_count"] >= p2["faces_count"]:
                    target, source = p1, p2
                else:
                    target, source = p2, p1

                conf_pct = min(99, max(60, int(round((sim - 0.25) / (0.75 - 0.25) * 50 + 50))))
                suggestions.append({
                    "target_person": target,
                    "source_person": source,
                    "similarity": round(sim, 3),
                    "confidence_pct": conf_pct
                })

    suggestions.sort(key=lambda x: x["similarity"], reverse=True)
    return suggestions[:25]

@router.get("/{person_id}")
def get_person_detail(
    person_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns person details and their photo count."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    if person.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
        
    faces = db.query(FaceDetection).filter(FaceDetection.person_id == person.id).all()
    unique_media_ids = list(set(f.media_id for f in faces))
    first_face = faces[0] if faces else None
    cover_media_id = first_face.media_id if first_face else None

    return {
        "id": person.id,
        "name": person.name,
        "is_hidden": person.is_hidden,
        "is_pet": bool(person.is_pet),
        "pet_type": person.pet_type,
        "relationship_type": person.relationship_type,
        "photo_count": len(unique_media_ids),
        "faces_count": len(faces),
        "avatar_url": f"/api/v1/people/{person.id}/avatar" if first_face else None,
        "cover_thumbnail_url": f"/api/v1/media/{cover_media_id}/thumbnail?size=256" if cover_media_id else None
    }

@router.get("/{person_id}/avatar")
def get_person_avatar(
    person_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Returns a square WebP face crop avatar for a person."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    if person.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
        
    first_face = db.query(FaceDetection).filter(FaceDetection.person_id == person.id).first()
    if not first_face:
        raise HTTPException(status_code=404, detail="No faces for this person")

    face_cache_path = os.path.join(settings.THUMBNAIL_DIR, f"face_{first_face.id}_180.webp")
    if os.path.isfile(face_cache_path):
        return FileResponse(
            face_cache_path,
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=31536000, immutable"}
        )

    crop_bytes = get_face_crop_image(db, first_face)
    if not crop_bytes:
        raise HTTPException(status_code=404, detail="Could not generate face crop")

    if os.path.isfile(face_cache_path):
        return FileResponse(
            face_cache_path,
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=31536000, immutable"}
        )

    return Response(
        content=crop_bytes, 
        media_type="image/webp", 
        headers={"Cache-Control": "public, max-age=31536000, immutable"}
    )

@router.get("/{person_id}/photos")
def get_person_photos(
    person_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns all media items associated with a person."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    if person.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
        
    faces = db.query(FaceDetection).filter(FaceDetection.person_id == person_id).all()
    media_ids = list(set(f.media_id for f in faces))
    
    # Fast scalar column projection avoids loading heavy ORM objects with EXIF & text
    photos = db.query(
        Media.id,
        Media.filename,
        Media.category,
        Media.captured_at,
        Media.location_name,
        Media.is_favorite
    ).filter(
        Media.id.in_(media_ids),
        Media.user_id == current_user.id,
        Media.is_deleted == False
    ).order_by(Media.captured_at.desc()).all()

    return [{
        "id": m[0],
        "filename": m[1],
        "category": m[2].value if hasattr(m[2], 'value') else str(m[2]),
        "captured_at": m[3],
        "location_name": m[4],
        "is_favorite": m[5],
        "thumbnail_url": f"/api/v1/media/{m[0]}/thumbnail?size=256"
    } for m in photos]

@router.post("/search-by-face")
def search_by_face(
    req: SearchFaceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Given a face crop (from drawn bounding box or existing face ID), computes its 512-d
    ArcFace embedding and performs instant multi-face vector similarity search across all library photos.
    """
    query_emb = None
    query_crop_url = None
    query_face_id = req.face_id

    # 1. Existing face ID
    if req.face_id:
        face = db.query(FaceDetection).filter(FaceDetection.id == req.face_id).first()
        if not face:
            raise HTTPException(status_code=404, detail="Face detection not found")
        query_crop_url = f"/api/v1/people/faces/{face.id}/crop"
        if face.embedding_str:
            try:
                query_emb = np.array([float(x) for x in face.embedding_str.split(",")])
            except Exception:
                pass
        if query_emb is None:
            media = db.query(Media).filter(Media.id == face.media_id).first()
            if media:
                img = load_media_image(media, db)
                if img:
                    crop = None
                    if getattr(face, "landmarks_str", None):
                        try:
                            lms = np.array([[float(c) for c in pt.split(":")] for pt in face.landmarks_str.split(",")])
                            crop = align_face_crop(img, lms)
                        except Exception:
                            crop = None
                    if crop is None:
                        W, H = img.size
                        cx = int((face.box_x + face.box_w / 2.0) * W)
                        cy = int((face.box_y + face.box_h / 2.0) * H)
                        half = int(max(face.box_w * W, face.box_h * H) * 0.65)
                        crop = img.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half)))
                    query_emb = extract_arcface_embedding(crop)

    # 2. Custom drawn or clicked box on media
    elif req.media_id and req.box_x is not None and req.box_y is not None:
        media = db.query(Media).filter(Media.id == req.media_id, Media.user_id == current_user.id).first()
        if not media:
            raise HTTPException(status_code=404, detail="Media not found")
        img = load_media_image(media, db)
        if not img:
            raise HTTPException(status_code=400, detail="Unable to load image for face extraction")

        W, H = img.size
        bw = req.box_w or 0.15
        bh = req.box_h or 0.18

        # Try to find high-precision SCRFD landmarks for this region
        crop = None
        landmarks_str = None
        try:
            detected = detect_faces_in_image(img)
            best_iou = 0.0
            best_d = None
            for d in detected:
                dx = max(d["box_x"], req.box_x)
                dy = max(d["box_y"], req.box_y)
                dw = min(d["box_x"] + d["box_w"], req.box_x + bw) - dx
                dh = min(d["box_y"] + d["box_h"], req.box_y + bh) - dy
                if dw > 0 and dh > 0:
                    inter = dw * dh
                    union = (d["box_w"] * d["box_h"]) + (bw * bh) - inter
                    iou = inter / max(union, 1e-6)
                    if iou > best_iou:
                        best_iou = iou
                        best_d = d
            if best_d and best_iou > 0.2 and best_d.get("landmarks") is not None:
                lms = best_d["landmarks"]
                landmarks_str = ",".join(f"{pt[0]:.4f}:{pt[1]:.4f}" for pt in lms)
                crop = align_face_crop(img, lms)
        except Exception:
            crop = None

        if crop is None:
            cx = int((req.box_x + bw / 2.0) * W)
            cy = int((req.box_y + bh / 2.0) * H)
            half = int(max(bw * W, bh * H) * 0.65)
            crop = img.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half)))

        query_emb = extract_arcface_embedding(crop)

        # Generate WebP base64 preview for query avatar
        try:
            buf = io.BytesIO()
            crop_sq = crop.convert("RGB").resize((180, 180), Image.Resampling.LANCZOS)
            crop_sq.save(buf, format="WEBP", quality=90)
            b64_crop = base64.b64encode(buf.getvalue()).decode("utf-8")
            query_crop_url = f"data:image/webp;base64,{b64_crop}"
        except Exception:
            query_crop_url = f"/api/v1/media/{media.id}/thumbnail?size=256"

        emb_str = ",".join(f"{x:.5f}" for x in query_emb) if query_emb is not None else None
        face = FaceDetection(
            media_id=media.id,
            person_id=None,
            box_x=req.box_x,
            box_y=req.box_y,
            box_w=bw,
            box_h=bh,
            confidence=1.0,
            embedding_str=emb_str,
            landmarks_str=landmarks_str
        )
        db.add(face)
        db.commit()
        db.refresh(face)
        query_face_id = face.id
        if not query_crop_url.startswith("data:"):
            query_crop_url = f"/api/v1/people/faces/{face.id}/crop"

    if query_emb is None:
        raise HTTPException(status_code=400, detail="Could not extract biometric face features from the specified area. Please ensure a face is visible.")

    # 3. Query all face embeddings for current user and preload people (eliminating N+1 queries)
    user_people = db.query(Person).filter(Person.user_id == current_user.id).all()
    person_map = {p.id: p for p in user_people}

    all_faces = (
        db.query(FaceDetection, Media)
        .join(Media, FaceDetection.media_id == Media.id)
        .filter(
            Media.user_id == current_user.id,
            Media.is_deleted == False,
            FaceDetection.embedding_str != None
        ).all()
    )

    matches_by_media: Dict[int, Dict[str, Any]] = {}
    suggested_person_counts: Dict[int, int] = {}
    threshold = req.similarity_threshold or 0.38

    # Fast vectorized ArcFace matrix comparison
    valid_face_data = []
    emb_vectors = []
    for face_item, media_item in all_faces:
        try:
            vec = [float(x) for x in face_item.embedding_str.split(",")]
            if len(vec) == 512:
                valid_face_data.append((face_item, media_item))
                emb_vectors.append(vec)
        except Exception:
            continue

    if emb_vectors and query_emb is not None:
        emb_matrix = np.array(emb_vectors, dtype=np.float32)
        q_norm = query_emb / (np.linalg.norm(query_emb) or 1.0)
        norms = np.linalg.norm(emb_matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        emb_matrix_norm = emb_matrix / norms
        scores = emb_matrix_norm @ q_norm

        for idx, (face_item, media_item) in enumerate(valid_face_data):
            sim = float(scores[idx])
            if sim >= threshold:
                conf_pct = min(99, max(50, int(round((sim - 0.25) / (0.75 - 0.25) * 50 + 50))))
                
                if media_item.id not in matches_by_media or sim > matches_by_media[media_item.id]["similarity"]:
                    person_obj = person_map.get(face_item.person_id) if face_item.person_id else None
                    
                    if person_obj and person_obj.name and not person_obj.name.startswith("Person "):
                        suggested_person_counts[person_obj.id] = suggested_person_counts.get(person_obj.id, 0) + 1

                    matches_by_media[media_item.id] = {
                        "media_id": media_item.id,
                        "face_id": face_item.id,
                        "filename": media_item.filename,
                        "thumbnail_url": f"/api/v1/media/{media_item.id}/thumbnail?size=256",
                        "captured_at": media_item.captured_at.isoformat() if media_item.captured_at else None,
                        "similarity": round(sim, 3),
                        "confidence_pct": conf_pct,
                        "current_person_id": person_obj.id if person_obj else None,
                        "current_person_name": person_obj.name if person_obj else None,
                        "box_x": face_item.box_x,
                        "box_y": face_item.box_y,
                        "box_w": face_item.box_w,
                        "box_h": face_item.box_h
                    }

    matches_list = sorted(list(matches_by_media.values()), key=lambda x: x["similarity"], reverse=True)

    suggested_name = None
    suggested_relationship = None
    suggested_person_id = None
    if suggested_person_counts:
        top_pid = max(suggested_person_counts.items(), key=lambda x: x[1])[0]
        top_p = db.query(Person).filter(Person.id == top_pid).first()
        if top_p:
            suggested_name = top_p.name
            suggested_relationship = getattr(top_p, "relationship_type", None)
            suggested_person_id = top_p.id

    return {
        "query_face_id": query_face_id,
        "query_crop_url": query_crop_url,
        "suggested_person_id": suggested_person_id,
        "suggested_name": suggested_name,
        "suggested_relationship": suggested_relationship,
        "total_matches": len(matches_list),
        "matches": matches_list
    }

@router.post("/group-matched-faces")
def group_matched_faces(
    req: GroupMatchedFacesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Groups all selected matching photos and face detections into a single Person profile.
    Creates the person or merges into an existing person, sets relationship and cover photo.
    """
    target_name = req.person_name.strip()
    if not target_name:
        raise HTTPException(status_code=400, detail="Person name is required")

    person = None
    if req.person_id:
        person = db.query(Person).filter(Person.id == req.person_id, Person.user_id == current_user.id).first()

    if not person:
        person = db.query(Person).filter(
            Person.user_id == current_user.id,
            func.lower(Person.name) == func.lower(target_name)
        ).first()

    if not person:
        person = Person(
            name=target_name,
            user_id=current_user.id,
            relationship_type=req.relationship_type.strip() if req.relationship_type else None,
            is_hidden=False
        )
        db.add(person)
        db.commit()
        db.refresh(person)
    else:
        person.name = target_name
        if req.relationship_type:
            person.relationship_type = req.relationship_type.strip()
        person.is_hidden = False

    if req.cover_media_id:
        person.cover_media_id = req.cover_media_id
    elif req.set_as_cover and req.media_ids:
        person.cover_media_id = req.media_ids[0]

    assigned_count = 0
    if req.face_ids:
        db.query(FaceDetection).filter(
            FaceDetection.id.in_(req.face_ids)
        ).update({"person_id": person.id}, synchronize_session=False)
        assigned_count += len(req.face_ids)

    if req.query_face_id and req.query_face_id not in req.face_ids:
        db.query(FaceDetection).filter(FaceDetection.id == req.query_face_id).update({"person_id": person.id}, synchronize_session=False)

    db.commit()
    db.refresh(person)

    faces = db.query(FaceDetection).filter(FaceDetection.person_id == person.id).all()
    unique_media = list(set(f.media_id for f in faces))

    return {
        "status": "success",
        "message": f"Successfully grouped {len(unique_media)} photos for {person.name}",
        "person": {
            "id": person.id,
            "name": person.name,
            "relationship_type": getattr(person, "relationship_type", None),
            "photo_count": len(unique_media),
            "faces_count": len(faces),
            "avatar_url": f"/api/v1/people/{person.id}/avatar"
        },
        "grouped_count": len(unique_media)
    }

@router.patch("/{person_id}")
def update_person(
    person_id: int,
    req: PersonUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Updates a person's name, relationship, or hidden status."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    if person.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    if req.name is not None:
        new_name = req.name.strip()
        if new_name:
            person.name = new_name
    if req.relationship_type is not None:
        person.relationship_type = req.relationship_type.strip() or None
    if req.is_hidden is not None:
        person.is_hidden = req.is_hidden

    db.commit()
    db.refresh(person)
    return {
        "id": person.id,
        "name": person.name,
        "relationship_type": person.relationship_type,
        "is_hidden": person.is_hidden
    }

@router.patch("/{person_id}/cover")
def set_person_cover(
    person_id: int,
    req: SetCoverRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Sets custom cover photo for a person."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    if person.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    media = db.query(Media).filter(Media.id == req.media_id, Media.user_id == current_user.id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    person.cover_media_id = media.id
    db.commit()
    return {"id": person.id, "cover_media_id": person.cover_media_id}

@router.post("/merge")
def merge_people(
    req: MergePeopleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Merges source person into target person (reassigns all face detections)."""
    if req.source_person_id == req.target_person_id:
        raise HTTPException(status_code=400, detail="Cannot merge a person into themselves.")

    source = db.query(Person).filter(Person.id == req.source_person_id).first()
    target = db.query(Person).filter(Person.id == req.target_person_id).first()
    
    if not source or not target:
        raise HTTPException(status_code=404, detail="One or both person profiles not found")

    def can_modify(p: Person) -> bool:
        if current_user.is_admin:
            return True
        return p.user_id is None or p.user_id == current_user.id

    if not can_modify(source) or not can_modify(target):
        raise HTTPException(status_code=403, detail="Access denied")

    if target.user_id is None and current_user.id:
        target.user_id = current_user.id
        
    db.query(FaceDetection).filter(
        FaceDetection.person_id == req.source_person_id
    ).update({"person_id": req.target_person_id}, synchronize_session=False)
    
    if not target.cover_media_id and source.cover_media_id:
        target.cover_media_id = source.cover_media_id
    if not target.relationship_type and source.relationship_type:
        target.relationship_type = source.relationship_type
    if not target.is_pet and source.is_pet:
        target.is_pet = source.is_pet
        target.pet_type = source.pet_type

    db.delete(source)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error executing person merge {req.source_person_id} -> {req.target_person_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error during merge: {str(e)}")

    return {"status": "merged", "target_id": target.id, "target_name": target.name}

@router.delete("/{person_id}")
def delete_person(
    person_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deletes a person profile and unlinks their faces."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    if person.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    db.query(FaceDetection).filter(FaceDetection.person_id == person_id).update({"person_id": None}, synchronize_session=False)
    db.delete(person)
    db.commit()
    return {"status": "deleted", "id": person_id}

@router.get("/media/{media_id}/faces")
def get_media_faces(
    media_id: int,
    auto_detect: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns all detected faces for a photo."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    faces = db.query(FaceDetection).filter(FaceDetection.media_id == media_id).all()
    if not faces and auto_detect:
        faces = process_faces_for_media(db, media)

    results = []
    for f in faces:
        person = db.query(Person).filter(Person.id == f.person_id).first() if f.person_id else None
        results.append({
            "id": f.id,
            "media_id": f.media_id,
            "person_id": f.person_id,
            "person_name": person.name if person else "Unnamed",
            "box_x": f.box_x,
            "box_y": f.box_y,
            "box_w": f.box_w,
            "box_h": f.box_h,
            "confidence": f.confidence
        })
    return results

@router.post("/media/{media_id}/faces")
def add_face_tag(
    media_id: int,
    req: TagFaceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually tags a face in a photo."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    name = req.person_name.strip()
    person = None
    if name:
        person = db.query(Person).filter(
            Person.user_id == current_user.id,
            func.lower(Person.name) == func.lower(name)
        ).first()
        if not person:
            person = Person(user_id=current_user.id, name=name)
            db.add(person)
            db.commit()
            db.refresh(person)

    # Compute ArcFace embedding for newly tagged face
    emb_str = None
    landmarks_str = None
    try:
        img = load_media_image(media, db)
        if img:
            W, H = img.size
            crop = None
            try:
                detected = detect_faces_in_image(img)
                best_iou = 0.0
                best_d = None
                for d in detected:
                    dx = max(d["box_x"], req.box_x)
                    dy = max(d["box_y"], req.box_y)
                    dw = min(d["box_x"] + d["box_w"], req.box_x + req.box_w) - dx
                    dh = min(d["box_y"] + d["box_h"], req.box_y + req.box_h) - dy
                    if dw > 0 and dh > 0:
                        inter = dw * dh
                        union = (d["box_w"] * d["box_h"]) + (req.box_w * req.box_h) - inter
                        iou = inter / max(union, 1e-6)
                        if iou > best_iou:
                            best_iou = iou
                            best_d = d
                if best_d and best_iou > 0.2 and best_d.get("landmarks") is not None:
                    lms = best_d["landmarks"]
                    landmarks_str = ",".join(f"{pt[0]:.4f}:{pt[1]:.4f}" for pt in lms)
                    crop = align_face_crop(img, lms)
            except Exception:
                crop = None

            if crop is None:
                cx = int((req.box_x + req.box_w / 2.0) * W)
                cy = int((req.box_y + req.box_h / 2.0) * H)
                half = int(max(req.box_w * W, req.box_h * H) * 0.65)
                crop = img.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half)))

            emb = extract_arcface_embedding(crop)
            if emb is not None:
                emb_str = ",".join(f"{x:.5f}" for x in emb)
    except Exception as e:
        logger.warning(f"Could not compute ArcFace embedding for face tag: {e}")

    face = FaceDetection(
        media_id=media.id,
        person_id=person.id if person else None,
        box_x=req.box_x,
        box_y=req.box_y,
        box_w=req.box_w,
        box_h=req.box_h,
        confidence=1.0,
        embedding_str=emb_str,
        landmarks_str=landmarks_str
    )
    db.add(face)
    db.commit()
    db.refresh(face)

    return {
        "id": face.id,
        "media_id": face.media_id,
        "person_id": face.person_id,
        "person_name": person.name if person else "Unnamed",
        "box_x": face.box_x,
        "box_y": face.box_y,
        "box_w": face.box_w,
        "box_h": face.box_h,
        "confidence": face.confidence
    }

@router.patch("/faces/{face_id}")
def update_face_tag(
    face_id: int,
    req: UpdateFaceTagRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Updates the person name assigned to a face detection."""
    face = db.query(FaceDetection).join(Media, FaceDetection.media_id == Media.id).filter(
        FaceDetection.id == face_id,
        (Media.user_id == current_user.id) | (current_user.is_admin == True)
    ).first()
    if not face:
        raise HTTPException(status_code=404, detail="Face detection not found or access denied")

    name = req.person_name.strip()
    if not name or name.lower() in ("unnamed", "unknown"):
        face.person_id = None
        db.commit()
        return {"id": face.id, "person_id": None, "person_name": "Unnamed"}

    person = db.query(Person).filter(
        Person.user_id == current_user.id,
        func.lower(Person.name) == func.lower(name)
    ).first()
    if not person:
        person = Person(user_id=current_user.id, name=name)
        db.add(person)
        db.commit()
        db.refresh(person)

    face.person_id = person.id
    if not face.embedding_str:
        try:
            m = db.query(Media).filter(Media.id == face.media_id).first()
            if m:
                img = load_media_image(m, db)
                if img:
                    crop = None
                    if getattr(face, "landmarks_str", None):
                        try:
                            lms = np.array([[float(c) for c in pt.split(":")] for pt in face.landmarks_str.split(",")])
                            crop = align_face_crop(img, lms)
                        except Exception:
                            crop = None
                    if crop is None:
                        W, H = img.size
                        cx = int((face.box_x + face.box_w / 2.0) * W)
                        cy = int((face.box_y + face.box_h / 2.0) * H)
                        half = int(max(face.box_w * W, face.box_h * H) * 0.65)
                        crop = img.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half)))
                    emb = extract_arcface_embedding(crop)
                    if emb is not None:
                        face.embedding_str = ",".join(f"{x:.5f}" for x in emb)
        except Exception:
            pass
    db.commit()
    return {"id": face.id, "person_id": person.id, "person_name": person.name}

@router.post("/detect-all")
def detect_all_library_faces(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Triggers offline face detection for all photos across the library."""
    res = index_all_library_faces(db)
    return res
