from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Table
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
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    media = relationship("Media", secondary=album_media, backref="albums")
    cover = relationship("Media", foreign_keys=[cover_media_id])
