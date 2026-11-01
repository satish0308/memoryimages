from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship as sa_relationship

from app.database import Base

class Person(Base):
    __tablename__ = "people"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(128), nullable=False, default="Unnamed Person")
    is_hidden = Column(Boolean, default=False)
    is_pet = Column(Boolean, default=False)
    pet_type = Column(String(32), nullable=True) # "dog", "cat", etc.
    relationship_type = Column(String(32), nullable=True) # "Family", "Friends", "Work", "Partner", "Self", "Acquaintance", etc.
    cover_media_id = Column(Integer, ForeignKey("media.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    faces = sa_relationship("FaceDetection", back_populates="person")

class FaceDetection(Base):
    __tablename__ = "face_detections"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(Integer, ForeignKey("people.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Bounding box coords normalized [0, 1] or pixels: x, y, width, height
    box_x = Column(Float, nullable=False)
    box_y = Column(Float, nullable=False)
    box_w = Column(Float, nullable=False)
    box_h = Column(Float, nullable=False)
    
    confidence = Column(Float, default=1.0)
    cluster_id = Column(Integer, nullable=True, index=True)
    
    # Store embedding as comma-separated or JSON string for portability
    embedding_str = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    media = sa_relationship("Media", back_populates="faces")
    person = sa_relationship("Person", back_populates="faces")
