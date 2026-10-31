from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User
from app.models.person import Person, FaceDetection
from app.models.media import Media
from app.api.auth import get_current_user, get_optional_current_user
from app.services.face_engine import (
    process_faces_for_media, 
    index_all_library_faces,
    get_face_crop_image,
    auto_cluster_faces
)

router = APIRouter()

class PersonUpdateRequest(BaseModel):
    name: str

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
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Lists identified people for current user along with their distinct photo count and avatar crop."""
    if not current_user:
        return []

    people = db.query(Person).filter(
        Person.user_id == current_user.id,
        Person.is_hidden == False
    ).all()
    results = []
    
    for p in people:
        faces = (
            db.query(FaceDetection)
            .join(Media, FaceDetection.media_id == Media.id)
            .filter(
                FaceDetection.person_id == p.id,
                Media.user_id == current_user.id,
                Media.is_deleted == False
            ).all()
        )
        unique_media_ids = list(set(f.media_id for f in faces))
        first_face = faces[0] if faces else None
        cover_media_id = first_face.media_id if first_face else None
        
        results.append({
            "id": p.id,
            "name": p.name,
            "photo_count": len(unique_media_ids),
            "faces_count": len(faces),
            "avatar_url": f"/api/v1/people/{p.id}/avatar" if first_face else None,
            "cover_thumbnail_url": f"/api/v1/media/{cover_media_id}/thumbnail?size=256" if cover_media_id else None
        })
    return sorted(results, key=lambda x: x["photo_count"], reverse=True)

@router.get("/stats")
def get_people_stats(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Returns face detection and people statistics for current user."""
    if not current_user:
        return {
            "total_faces": 0,
            "total_people": 0,
            "tagged_faces": 0,
            "unassigned_faces": 0,
            "photos_with_faces": 0
        }

    uid = current_user.id
    total_faces = (
        db.query(FaceDetection)
        .join(Media, FaceDetection.media_id == Media.id)
        .filter(Media.user_id == uid, Media.is_deleted == False)
        .count()
    )
    total_people = db.query(Person).filter(Person.user_id == uid, Person.is_hidden == False).count()
    tagged_faces = (
        db.query(FaceDetection)
        .join(Media, FaceDetection.media_id == Media.id)
        .filter(FaceDetection.person_id != None, Media.user_id == uid, Media.is_deleted == False)
        .count()
    )
    photos_with_faces = (
        db.query(func.count(func.distinct(FaceDetection.media_id)))
        .join(Media, FaceDetection.media_id == Media.id)
        .filter(Media.user_id == uid, Media.is_deleted == False)
        .scalar() or 0
    )
    return {
        "total_faces": total_faces,
        "total_people": total_people,
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

    unnamed = (
        db.query(FaceDetection)
        .join(Media, FaceDetection.media_id == Media.id)
        .outerjoin(Person, FaceDetection.person_id == Person.id)
        .filter(
            Media.user_id == current_user.id,
            Media.is_deleted == False,
            (FaceDetection.person_id == None) | (Person.name.like("Person %")) | (Person.name == "Unnamed Person")
        )
        .limit(limit)
        .all()
    )
    results = []
    for f in unnamed:
        m = db.query(Media).filter(Media.id == f.media_id).first()
        p = db.query(Person).filter(Person.id == f.person_id).first() if f.person_id else None
        results.append({
            "id": f.id,
            "media_id": f.media_id,
            "filename": m.filename if m else "Unknown",
            "captured_at": m.captured_at if m else None,
            "person_id": f.person_id,
            "person_name": p.name if p else "Unnamed",
            "crop_url": f"/api/v1/people/faces/{f.id}/crop",
            "confidence": f.confidence
        })
    return results

@router.post("/auto-cluster")
def trigger_auto_cluster(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Auto-clusters detected faces into Person groups."""
    res = auto_cluster_faces(db)
    return res

@router.get("/faces/{face_id}/crop")
def get_face_crop(
    face_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Returns a square WebP face crop avatar for a specific face detection."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    face = db.query(FaceDetection).join(Media, FaceDetection.media_id == Media.id).filter(
        FaceDetection.id == face_id,
        (Media.user_id == current_user.id) | (current_user.is_admin == True)
    ).first()
    if not face:
        raise HTTPException(status_code=404, detail="Face detection not found or access denied")
        
    crop_bytes = get_face_crop_image(db, face)
    if not crop_bytes:
        raise HTTPException(status_code=404, detail="Could not generate face crop")
        
    return Response(
        content=crop_bytes, 
        media_type="image/webp", 
        headers={"Cache-Control": "public, max-age=86400"}
    )

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
        
    crop_bytes = get_face_crop_image(db, first_face)
    if not crop_bytes:
        raise HTTPException(status_code=404, detail="Could not generate face crop")
        
    return Response(
        content=crop_bytes, 
        media_type="image/webp", 
        headers={"Cache-Control": "public, max-age=86400"}
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
    
    photos = db.query(Media).filter(
        Media.id.in_(media_ids),
        Media.user_id == current_user.id,
        Media.is_deleted == False
    ).order_by(Media.captured_at.desc()).all()

    return [{
        "id": m.id,
        "filename": m.filename,
        "category": m.category.value if hasattr(m.category, 'value') else str(m.category),
        "captured_at": m.captured_at,
        "location_name": m.location_name,
        "is_favorite": m.is_favorite,
        "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256"
    } for m in photos]

@router.patch("/{person_id}")
def update_person_name(
    person_id: int,
    req: PersonUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Updates a person's display name."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    if person.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    new_name = req.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    person.name = new_name
    db.commit()
    return {"id": person.id, "name": person.name}

@router.post("/merge")
def merge_people(
    req: MergePeopleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Merges source person into target person (reassigns all face detections)."""
    source = db.query(Person).filter(Person.id == req.source_person_id).first()
    target = db.query(Person).filter(Person.id == req.target_person_id).first()
    
    if not source or not target:
        raise HTTPException(status_code=404, detail="One or both person IDs not found")
    if (source.user_id != current_user.id or target.user_id != current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
        
    db.query(FaceDetection).filter(
        FaceDetection.person_id == req.source_person_id
    ).update({"person_id": req.target_person_id}, synchronize_session=False)
    
    db.delete(source)
    db.commit()
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

    face = FaceDetection(
        media_id=media.id,
        person_id=person.id if person else None,
        box_x=req.box_x,
        box_y=req.box_y,
        box_w=req.box_w,
        box_h=req.box_h,
        confidence=1.0
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
    db.commit()
    return {"id": face.id, "person_id": person.id, "person_name": person.name}

@router.delete("/faces/{face_id}")
def delete_face_detection(
    face_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Removes a face detection from a photo."""
    face = db.query(FaceDetection).join(Media, FaceDetection.media_id == Media.id).filter(
        FaceDetection.id == face_id,
        (Media.user_id == current_user.id) | (current_user.is_admin == True)
    ).first()
    if not face:
        raise HTTPException(status_code=404, detail="Face detection not found or access denied")

    db.delete(face)
    db.commit()
    return {"status": "deleted", "id": face_id}

@router.post("/detect-all")
def detect_all_library_faces(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Triggers offline face detection for all photos across the library."""
    res = index_all_library_faces(db)
    return res
