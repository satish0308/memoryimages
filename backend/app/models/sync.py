import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text

from app.database import Base

class SyncStatus(str, enum.Enum):
    IDLE = "idle"
    SYNCING = "syncing"
    ERROR = "error"

class SyncType(str, enum.Enum):
    LOCAL = "local"
    GOOGLE_DRIVE = "google_drive"

class SyncSource(Base):
    __tablename__ = "sync_sources"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    name = Column(String(128), nullable=False)
    sync_type = Column(Enum(SyncType), nullable=False)
    target_path = Column(String(1024), nullable=False)  # Local directory path or Google Drive folder ID
    
    is_active = Column(Boolean, default=True)
    status = Column(Enum(SyncStatus), default=SyncStatus.IDLE)
    last_synced_at = Column(DateTime, nullable=True)
    items_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    
    # OAuth credentials/tokens stored for Google Drive
    oauth_tokens_json = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
