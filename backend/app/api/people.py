from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.person import Person, FaceDetection
from app.models.media import Media

router = APIRouter()

class PersonUpdateRequest(BaseModel):
    name: str

class MergePeopleRequest(BaseModel):
    source_person_id: int
    target_person_id: int

@router.get("")
def list_people(db: Session = Depends(get_db)):
    """Lists all identified people along with their photo count and cover thumbnail."""
    people = db.query(Person).filter(Person.is_hidden == False).all()
    results = []
    
    for p in people:
        faces_count = db.query(FaceDetection).filter(FaceDetection.person_id == p.id).count()
        # Find a sample photo for avatar
        first_face = db.query(FaceDetection).filter(FaceDetection.person_id == p.id).first()
        cover_media_id = first_face.media_id if first_face else None
        
        results.append({
            "id": p.id,
            "name": p.name,
            "photo_count": faces_count,
            "cover_thumbnail_url": f"/api/v1/media/{cover_media_id}/thumbnail?size=256" if cover_media_id else None
        })
    return results

@router.get("/{person_id}/photos")
def get_person_photos(person_id: int, db: Session = Depends(get_db)):
    """Returns all media items associated with a person."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
        
    faces = db.query(FaceDetection).filter(FaceDetection.person_id == person_id).all()
    media_ids = [f.media_id for f in faces]
    
    photos = db.query(Media).filter(Media.id.in_(media_ids), Media.is_deleted == False).all()
    return [{
        "id": m.id,
        "filename": m.filename,
        "captured_at": m.captured_at,
        "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256"
    } for m in photos]

@router.patch("/{person_id}")
def update_person_name(person_id: int, req: PersonUpdateRequest, db: Session = Depends(get_db)):
    """Updates a person's display name."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    person.name = req.name
    db.commit()
    return {"id": person.id, "name": person.name}

@router.post("/merge")
def merge_people(req: MergePeopleRequest, db: Session = Depends(get_db)):
    """Merges source person into target person (reassigns all face detections)."""
    source = db.query(Person).filter(Person.id == req.source_person_id).first()
    target = db.query(Person).filter(Person.id == req.target_person_id).first()
    
    if not source or not target:
        raise HTTPException(status_code=404, detail="One or both person IDs not found")
        
    db.query(FaceDetection).filter(
        FaceDetection.person_id == req.source_person_id
    ).update({"person_id": req.target_person_id}, synchronize_session=False)
    
    db.delete(source)
    db.commit()
    return {"status": "merged", "target_id": target.id, "target_name": target.name}
