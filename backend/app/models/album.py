from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Table, Boolean
from sqlalchemy.orm import relationship

from app.database import Base

album_media = Table(
    "album_media",
    Base.metadata,
    Column("album_id", Integer, ForeignKey("albums.id", ondelete="CASCADE"), primary_key=True),
    Column("media_id", Integer, ForeignKey("media.id", ondelete="CASCADE"), primary_key=True)
)

class Album(Base):
    __tablename__ = "albums"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    cover_media_id = Column(Integer, ForeignKey("media.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    is_dynamic = Column(Boolean, default=False, nullable=False)
    rules = Column(Text, nullable=True)
    share_token = Column(String(64), unique=True, index=True, nullable=True)
    is_public = Column(Boolean, default=False, nullable=False)
    allow_guest_uploads = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("app.models.user.User", backref="albums")
    media = relationship("Media", secondary=album_media, backref="albums")
    cover = relationship("Media", foreign_keys=[cover_media_id])
