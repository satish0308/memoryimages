import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Enum, ForeignKey, Text, LargeBinary
from sqlalchemy.orm import relationship

from app.database import Base

class MediaCategory(str, enum.Enum):
    MEMORY = "memory"
    SCREENSHOT = "screenshot"
    DOCUMENT_BILL = "document_bill"
    MEME_JUNK = "meme_junk"
    UNCATEGORIZED = "uncategorized"

class SourceType(str, enum.Enum):
    LOCAL = "local"
    GOOGLE_DRIVE = "google_drive"
    MANUAL_UPLOAD = "manual_upload"
    S3_MINIO = "s3_minio"

class Media(Base):
    __tablename__ = "media"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    original_path = Column(String(1024), nullable=False, unique=True, index=True)
    file_size = Column(Integer, default=0)
    file_hash = Column(String(64), index=True)  # SHA256
    perceptual_hash = Column(String(32), index=True)  # pHash for deduplication
    
    mime_type = Column(String(64), default="image/jpeg")
    width = Column(Integer, default=0)
    height = Column(Integer, default=0)
    
    # Categorization & Triage
    category = Column(Enum(MediaCategory), default=MediaCategory.UNCATEGORIZED, index=True)
    triage_confidence = Column(Float, default=0.0)
    blurriness_score = Column(Float, default=0.0)
    is_blurry = Column(Boolean, default=False)
    blur_type = Column(String(32), default="sharp", index=True)
    is_bokeh = Column(Boolean, default=False, index=True)
    is_enhanced = Column(Boolean, default=False, index=True)
    enhancement_data = Column(Text, nullable=True)
    aesthetic_score = Column(Float, default=0.0, index=True)
    is_best_shot = Column(Boolean, default=False, index=True)
    
    # Timestamps & Expiry
    captured_at = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True, index=True)  # Auto-purge countdown for screenshots
    
    # Status flags
    is_favorite = Column(Boolean, default=False, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    is_deleted = Column(Boolean, default=False, index=True)
    
    # EXIF Metadata
    camera_make = Column(String(128), nullable=True)
    camera_model = Column(String(128), nullable=True)
    iso = Column(Integer, nullable=True)
    focal_length = Column(Float, nullable=True)
    exposure_time = Column(String(32), nullable=True)
    latitude = Column(Float, nullable=True, index=True)
    longitude = Column(Float, nullable=True, index=True)
    location_name = Column(String(255), nullable=True)
    
    # Thumbnails
    thumbnail_256_path = Column(String(1024), nullable=True)
    thumbnail_1080_path = Column(String(1024), nullable=True)
    
    # OCR Text (for bills, receipts, documents)
    extracted_text = Column(Text, nullable=True)
    
    # Source tracking
    source_type = Column(Enum(SourceType), default=SourceType.LOCAL)
    source_id = Column(String(255), nullable=True)  # External ID (e.g. Google Drive File ID)

    # AI Emotion, Mood & Color Attributes
    mood = Column(String(64), nullable=True, index=True)
    mood_score = Column(Float, default=0.0)
    is_smiling = Column(Boolean, default=False, index=True)
    dominant_color = Column(String(32), nullable=True, index=True)
    color_hex = Column(String(7), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    has_motion_photo = Column(Boolean, default=False, index=True)
    share_token = Column(String(64), unique=True, index=True, nullable=True)

    # Relationships
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    user = relationship("app.models.user.User", backref="media_items")
    faces = relationship("FaceDetection", back_populates="media", cascade="all, delete-orphan")
    embedding = relationship("MediaEmbedding", back_populates="media", uselist=False, cascade="all, delete-orphan")
    keyframes = relationship("VideoKeyframe", back_populates="media", cascade="all, delete-orphan")

try:
    from pgvector.sqlalchemy import Vector
    EmbeddingVectorType = Vector(512)
except Exception:
    from sqlalchemy.types import UserDefinedType
    class FallbackVector(UserDefinedType):
        def get_col_spec(self, **kw):
            return "vector(512)"
    EmbeddingVectorType = FallbackVector()

class MediaEmbedding(Base):
    __tablename__ = "media_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("media.id", ondelete="CASCADE"), unique=True, index=True)
    vector = Column(LargeBinary, nullable=True)  # 512 float32 = 2048 bytes
    embedding = Column(EmbeddingVectorType, nullable=True)  # Native pgvector 512-dim vector for HNSW queries
    created_at = Column(DateTime, default=datetime.utcnow)

    media = relationship("Media", back_populates="embedding")

class VideoKeyframe(Base):
    __tablename__ = "video_keyframes"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("media.id", ondelete="CASCADE"), index=True, nullable=False)
    timestamp_seconds = Column(Float, nullable=False)
    thumbnail_path = Column(String(1024), nullable=True)
    vector = Column(LargeBinary, nullable=True)  # 512 float32 = 2048 bytes
    embedding = Column(EmbeddingVectorType, nullable=True)  # Native pgvector 512-dim vector
    created_at = Column(DateTime, default=datetime.utcnow)

    media = relationship("Media", back_populates="keyframes")


