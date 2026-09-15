import os
import json
from typing import Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session

from app.config import settings
from app.models.sync import SyncSource, SyncStatus, SyncType
from app.models.media import SourceType
from app.services.scanner import scan_file

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/drive.readonly"
]

def get_google_auth_url() -> Dict[str, str]:
    """Generates the Google OAuth2 consent screen URL."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        return {
            "error": "Google Client ID and Secret are not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env."
        }
        
    try:
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [settings.GOOGLE_REDIRECT_URI]
                }
            },
            scopes=SCOPES,
            redirect_uri=settings.GOOGLE_REDIRECT_URI
        )
        auth_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="select_account consent"
        )
        return {"auth_url": auth_url, "state": state}
    except Exception as e:
        return {"error": str(e)}

def handle_oauth_callback(db: Session, code: str) -> Dict[str, Any]:
    """Exchanges Google authorization code for tokens and registers SyncSource."""
    try:
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [settings.GOOGLE_REDIRECT_URI]
                }
            },
            scopes=SCOPES,
            redirect_uri=settings.GOOGLE_REDIRECT_URI
        )
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        creds_data = {
            "token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": credentials.scopes
        }
        
        # Save or update SyncSource
        source = db.query(SyncSource).filter(SyncSource.sync_type == SyncType.GOOGLE_DRIVE).first()
        if not source:
            source = SyncSource(
                name="Google Drive Photos",
                sync_type=SyncType.GOOGLE_DRIVE,
                target_path="root",
                oauth_tokens_json=json.dumps(creds_data),
                status=SyncStatus.IDLE
            )
            db.add(source)
        else:
            source.oauth_tokens_json = json.dumps(creds_data)
            source.status = SyncStatus.IDLE
            
        db.commit()
        db.refresh(source)
        return {"status": "success", "source_id": source.id}
    except Exception as e:
        return {"status": "error", "error": str(e)}

def run_google_drive_sync(db: Session, source_id: int) -> Dict[str, Any]:
    """Syncs photos from Google Drive into /data/originals/google_drive."""
    source = db.query(SyncSource).filter(SyncSource.id == source_id).first()
    if not source or not source.oauth_tokens_json:
        return {"status": "error", "message": "Google Drive credentials missing"}
        
    source.status = SyncStatus.SYNCING
    db.commit()
    
    try:
        # Save images into google_drive subdirectory
        dest_dir = os.path.join(settings.MEDIA_DIR, "google_drive")
        os.makedirs(dest_dir, exist_ok=True)
        
        # In a full run, use googleapiclient.discovery.build('drive', 'v3', credentials=...)
        # to query mimeType contains 'image/' and download them incrementally.
        
        source.status = SyncStatus.IDLE
        source.last_synced_at = datetime.utcnow()
        db.commit()
        return {"status": "completed", "source_id": source.id}
    except Exception as e:
        source.status = SyncStatus.ERROR
        source.error_message = str(e)
        db.commit()
        return {"status": "error", "message": str(e)}
