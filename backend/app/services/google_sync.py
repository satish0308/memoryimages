import os
import json
import io
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session

# Allow Google OAuth to return additional scopes without raising ScopeChanged error
os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

from app.config import settings
from app.models.sync import SyncSource, SyncStatus, SyncType
from app.models.media import Media, SourceType
from app.services.scanner import scan_file, scan_file_in_memory
from app.services.settings_service import get_storage_mode, is_local_storage_approved
from app.services.drive_cache import cache_drive_thumbnail_link

logger = logging.getLogger(__name__)

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive"
]

# In-memory PKCE code_verifier store keyed by OAuth state
_oauth_verifiers: Dict[str, str] = {}
_latest_verifier: Optional[str] = None

def get_google_auth_url() -> Dict[str, str]:
    """Generates the Google OAuth2 consent screen URL."""
    global _latest_verifier
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
        if hasattr(flow, "code_verifier") and flow.code_verifier:
            _oauth_verifiers[state] = flow.code_verifier
            _latest_verifier = flow.code_verifier

        return {"auth_url": auth_url, "state": state}
    except Exception as e:
        return {"error": str(e)}

def handle_oauth_callback(db: Session, code: str, state: Optional[str] = None) -> Dict[str, Any]:
    """Exchanges Google authorization code for tokens and registers SyncSource."""
    global _latest_verifier
    verifier = None
    if state and state in _oauth_verifiers:
        verifier = _oauth_verifiers.pop(state)
    elif _latest_verifier:
        verifier = _latest_verifier

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
        if verifier:
            flow.fetch_token(code=code, code_verifier=verifier)
        else:
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
        
        display_name = "Google Drive Photos"
        user_email = None
        user_name = None
        try:
            oauth2_service = build("oauth2", "v2", credentials=credentials)
            user_info = oauth2_service.userinfo().get().execute()
            user_email = user_info.get("email")
            user_name = user_info.get("name")
            if user_email:
                display_name = f"Google Drive ({user_email})"
        except Exception as e:
            logger.warning(f"Could not fetch user profile info: {e}")

        # Save or update SyncSource for Google Drive
        source = db.query(SyncSource).filter(SyncSource.sync_type == SyncType.GOOGLE_DRIVE).first()
        if not source:
            source = SyncSource(
                name=display_name,
                sync_type=SyncType.GOOGLE_DRIVE,
                target_path="root",
                oauth_tokens_json=json.dumps(creds_data),
                status=SyncStatus.IDLE
            )
            db.add(source)
        else:
            source.name = display_name
            source.oauth_tokens_json = json.dumps(creds_data)
            source.status = SyncStatus.IDLE
            
        db.commit()
        db.refresh(source)

        # Authenticate / Register the Google Account into the local User system
        from sqlalchemy import func
        from app.models.user import User
        from app.services.auth_service import create_access_token, get_password_hash
        import secrets

        user = None
        access_token = None
        if user_email:
            clean_email = user_email.strip().lower()
            user = db.query(User).filter(func.lower(User.email) == clean_email).first()
            if not user:
                # Generate unique username from email prefix
                base_username = clean_email.split("@")[0].replace(".", "_")
                candidate_username = base_username
                suffix = 1
                while db.query(User).filter(func.lower(User.username) == candidate_username.lower()).first():
                    candidate_username = f"{base_username}_{suffix}"
                    suffix += 1

                is_admin = db.query(User).count() == 0 or candidate_username == "admin"
                user = User(
                    username=candidate_username,
                    email=clean_email,
                    full_name=user_name or candidate_username,
                    hashed_password=get_password_hash(secrets.token_urlsafe(32)),
                    is_active=True,
                    is_admin=is_admin
                )
                db.add(user)
                db.commit()
                db.refresh(user)
            else:
                if user_name and not user.full_name:
                    user.full_name = user_name
                user.is_active = True
                db.commit()
                db.refresh(user)

            access_token = create_access_token({
                "sub": str(user.id),
                "username": user.username,
                "email": user.email,
                "is_admin": user.is_admin
            })
            source.user_id = user.id
            db.commit()

        return {
            "status": "success",
            "source_id": source.id,
            "access_token": access_token,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "is_admin": user.is_admin
            } if user else None
        }
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return {"status": "error", "error": str(e)}

def run_google_drive_sync(db: Session, source_id: int) -> Dict[str, Any]:
    """Syncs photos from Google Drive into /data/originals/google_drive."""
    source = db.query(SyncSource).filter(SyncSource.id == source_id).first()
    if not source or not source.oauth_tokens_json:
        return {"status": "error", "message": "Google Drive credentials missing"}
        
    source.status = SyncStatus.SYNCING
    db.commit()
    
    try:
        creds_info = json.loads(source.oauth_tokens_json)
        credentials = Credentials(
            token=creds_info.get("token"),
            refresh_token=creds_info.get("refresh_token"),
            token_uri=creds_info.get("token_uri"),
            client_id=creds_info.get("client_id"),
            client_secret=creds_info.get("client_secret"),
            scopes=creds_info.get("scopes")
        )

        service = build("drive", "v3", credentials=credentials)
        
        storage_mode = get_storage_mode(db)
        local_approved = is_local_storage_approved(db)

        # Query for all non-trashed images in Google Drive, requesting thumbnailLink
        query = "mimeType contains 'image/' and trashed = false"
        results = service.files().list(
            q=query,
            pageSize=100,
            fields="files(id, name, mimeType, size, thumbnailLink)"
        ).execute()
        
        items = results.get("files", [])
        synced_count = 0
        
        for item in items:
            file_id = item["id"]
            name = item["name"]
            thumb_link = item.get("thumbnailLink")
            if thumb_link:
                cache_drive_thumbnail_link(file_id, thumb_link)
            
            # Check if this Google Drive file ID has already been ingested
            existing = db.query(Media).filter(
                Media.source_type == SourceType.GOOGLE_DRIVE,
                Media.source_id == file_id
            ).first()
            if existing:
                continue

            request = service.files().get_media(fileId=file_id)

            if storage_mode == "in_memory" or not local_approved:
                # Strictly in-memory process: zero local disk writes or volume mount usage
                mem_buf = io.BytesIO()
                downloader = MediaIoBaseDownload(mem_buf, request, chunksize=1024 * 1024)
                done = False
                while not done:
                    _, done = downloader.next_chunk()
                mem_buf.seek(0)

                media = scan_file_in_memory(
                    db=db,
                    buffer=mem_buf,
                    filename=name,
                    source_type=SourceType.GOOGLE_DRIVE,
                    source_id=file_id,
                    thumbnail_link=thumb_link,
                    user_id=source.user_id
                )
                if media:
                    synced_count += 1
            else:
                # Approved local storage: save to local directory and scan
                dest_dir = os.path.join(settings.MEDIA_DIR, "google_drive")
                os.makedirs(dest_dir, exist_ok=True)
                safe_name = f"{file_id}_{name}"
                file_dest = os.path.join(dest_dir, safe_name)

                with open(file_dest, "wb") as f:
                    downloader = MediaIoBaseDownload(f, request)
                    done = False
                    while not done:
                        _, done = downloader.next_chunk()

                media = scan_file(db, file_dest, source_type=SourceType.GOOGLE_DRIVE, source_id=file_id, user_id=source.user_id)
                if media:
                    synced_count += 1
                
        source.status = SyncStatus.IDLE
        source.items_count = (source.items_count or 0) + synced_count
        source.last_synced_at = datetime.utcnow()
        db.commit()
        return {"status": "completed", "synced_photos": synced_count, "source_id": source.id}
    except Exception as e:
        logger.error(f"Google Drive sync error: {e}")
        source.status = SyncStatus.ERROR
        source.error_message = str(e)
        db.commit()
        return {"status": "error", "message": str(e)}
