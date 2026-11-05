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
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload

from app.config import settings
from app.models.sync import SyncSource, SyncStatus, SyncType
from app.models.media import Media, SourceType
from app.services.scanner import scan_file, scan_file_in_memory
from app.services.settings_service import get_storage_mode, is_local_storage_approved
from app.services.drive_cache import cache_drive_thumbnail_link
from app.services.triage_engine import classify_media_item

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

def run_google_drive_sync(db: Session, source_id: int, user_id: Optional[int] = None) -> Dict[str, Any]:
    """Syncs photos from Google Drive into user account library."""
    source = db.query(SyncSource).filter(SyncSource.id == source_id).first()
    if not source or not source.oauth_tokens_json:
        return {"status": "error", "message": "Google Drive credentials missing"}
        
    source.status = SyncStatus.SYNCING
    effective_user_id = user_id or source.user_id
    if effective_user_id and source.user_id != effective_user_id:
        source.user_id = effective_user_id
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

        relinked_count = 0
        if effective_user_id:
            # Dynamically ensure all previously ingested drive media is associated with the user
            relinked = db.query(Media).filter(
                Media.source_type == SourceType.GOOGLE_DRIVE,
                (Media.user_id == None) | (Media.user_id != effective_user_id)
            ).update({Media.user_id: effective_user_id}, synchronize_session=False)
            if relinked > 0:
                relinked_count += relinked
                db.commit()

        # Preload all existing source_ids for O(1) set lookup
        existing_ids = set(
            row[0] for row in db.query(Media.source_id).filter(
                Media.source_type == SourceType.GOOGLE_DRIVE,
                Media.source_id != None
            ).all()
        )

        # Query for all non-trashed images and videos in Google Drive using high-throughput pageSize=1000
        query = "(mimeType contains 'image/' or mimeType contains 'video/') and trashed = false"
        page_token = None
        new_media_batch = []
        synced_count = 0
        already_count = 0
        total_discovered = 0
        max_import_per_sync = 5000

        while True:
            list_kwargs = {
                "q": query,
                "pageSize": 1000,
                "fields": "nextPageToken, files(id, name, mimeType, size, createdTime, thumbnailLink, imageMediaMetadata, videoMediaMetadata)"
            }
            if page_token:
                list_kwargs["pageToken"] = page_token

            results = service.files().list(**list_kwargs).execute()
            files = results.get("files", [])
            total_discovered += len(files)

            for f in files:
                file_id = f["id"]
                thumb_link = f.get("thumbnailLink")
                if thumb_link:
                    cache_drive_thumbnail_link(file_id, thumb_link)

                if file_id in existing_ids:
                    already_count += 1
                    continue

                name = f.get("name", "untitled.jpg")
                mime_type = f.get("mimeType", "image/jpeg")
                file_size = int(f.get("size", 0) or 0)

                img_meta = f.get("imageMediaMetadata") or {}
                vid_meta = f.get("videoMediaMetadata") or {}
                try:
                    width = int(img_meta.get("width") or vid_meta.get("width") or 0)
                except Exception:
                    width = 0
                try:
                    height = int(img_meta.get("height") or vid_meta.get("height") or 0)
                except Exception:
                    height = 0
                camera_make = img_meta.get("cameraMake")
                camera_model = img_meta.get("cameraModel")
                try:
                    iso = int(img_meta.get("isoSpeed")) if img_meta.get("isoSpeed") is not None else None
                except Exception:
                    iso = None
                try:
                    focal_length = float(img_meta.get("focalLength")) if img_meta.get("focalLength") is not None else None
                except Exception:
                    focal_length = None
                exposure_time = str(img_meta.get("exposureTime")) if img_meta.get("exposureTime") is not None else None

                captured_at = None
                time_str = img_meta.get("time")
                if time_str:
                    try:
                        captured_at = datetime.strptime(time_str[:19], "%Y:%m:%d %H:%M:%S")
                    except Exception:
                        pass
                if not captured_at and f.get("createdTime"):
                    try:
                        captured_at = datetime.fromisoformat(f["createdTime"].replace("Z", "+00:00")).replace(tzinfo=None)
                    except Exception:
                        pass
                if not captured_at:
                    captured_at = datetime.utcnow()

                category, confidence, expires_at = classify_media_item(
                    filename=name,
                    width=width,
                    height=height,
                    camera_make=camera_make,
                    camera_model=camera_model,
                    captured_at=captured_at
                )

                duration_seconds = None
                if vid_meta and vid_meta.get("durationMillis"):
                    try:
                        duration_seconds = float(vid_meta["durationMillis"]) / 1000.0
                    except Exception:
                        pass

                # Extract location if Google Drive metadata contains it
                loc = img_meta.get("location") or vid_meta.get("location")
                latitude = None
                longitude = None
                location_name = None
                if loc and isinstance(loc, dict):
                    try:
                        latitude = float(loc.get("latitude")) if loc.get("latitude") is not None else None
                        longitude = float(loc.get("longitude")) if loc.get("longitude") is not None else None
                        if latitude is not None and longitude is not None:
                            from app.services.scanner import reverse_geocode
                            location_name = reverse_geocode(latitude, longitude)
                    except Exception:
                        pass

                is_motion = name.startswith("MVIMG_") or name.endswith("_MP.jpg") or name.endswith("_MP.jpeg") or name.endswith("_MP.heic")
                media_obj = Media(
                    filename=name,
                    original_path=f"gdrive://{file_id}/{name}",
                    file_size=file_size,
                    mime_type=mime_type,
                    width=width,
                    height=height,
                    category=category,
                    triage_confidence=confidence,
                    expires_at=expires_at,
                    camera_make=camera_make,
                    camera_model=camera_model,
                    iso=iso,
                    focal_length=focal_length,
                    exposure_time=exposure_time,
                    duration_seconds=duration_seconds,
                    has_motion_photo=is_motion,
                    latitude=latitude,
                    longitude=longitude,
                    location_name=location_name,
                    captured_at=captured_at,
                    thumbnail_256_path=f"gdrive_cdn://{file_id}" if thumb_link else None,
                    source_type=SourceType.GOOGLE_DRIVE,
                    source_id=file_id,
                    user_id=effective_user_id
                )
                new_media_batch.append(media_obj)
                existing_ids.add(file_id)
                synced_count += 1

                if len(new_media_batch) >= 1000:
                    db.bulk_save_objects(new_media_batch)
                    db.commit()
                    new_media_batch = []

                if synced_count >= max_import_per_sync:
                    break

            if synced_count >= max_import_per_sync:
                break

            page_token = results.get("nextPageToken")
            if not page_token:
                break

        if new_media_batch:
            db.bulk_save_objects(new_media_batch)
            db.commit()

        # Automatic post-sync GPS extraction & outing propagation for new photos
        if synced_count > 0 and effective_user_id:
            try:
                scan_google_drive_geotags(db=db, user_id=effective_user_id, max_photos=synced_count + 100, propagate_hours=3.0)
            except Exception as e:
                logger.warning(f"Post-sync GPS extraction notice: {e}")

        total_active_user_media = db.query(Media).filter(
            Media.user_id == effective_user_id,
            Media.is_deleted == False
        ).count() if effective_user_id else total_discovered

        source.status = SyncStatus.IDLE
        source.items_count = total_active_user_media
        source.last_synced_at = datetime.utcnow()
        db.commit()

        has_more = bool(page_token and synced_count >= max_import_per_sync)
        if synced_count > 0:
            msg = f"Sync complete: imported {synced_count} photos from Google Drive ({total_active_user_media} total in library)!"
            if has_more:
                msg += " (Click Sync again to import next batch)"
        elif relinked_count > 0:
            msg = f"Sync complete: successfully verified and linked {relinked_count} photos to your library ({total_active_user_media} total)!"
        else:
            msg = f"Sync complete: all {total_active_user_media} photos verified up to date in your library!"

        return {
            "status": "completed",
            "synced_photos": synced_count,
            "already_synced": already_count,
            "relinked_photos": relinked_count,
            "total_discovered": total_discovered,
            "total_library_photos": total_active_user_media,
            "has_more": has_more,
            "source_id": source.id,
            "message": msg
        }
    except Exception as e:
        logger.error(f"Google Drive sync error: {e}")
        source.status = SyncStatus.ERROR
        source.error_message = str(e)
        db.commit()
        return {"status": "error", "message": str(e)}

def delete_file_from_google_drive(db: Session, file_id: str, user_id: int, permanent: bool = False) -> bool:
    """Deletes or trashes a file directly in Google Drive for the specified user."""
    try:
        source = db.query(SyncSource).filter(
            SyncSource.user_id == user_id,
            SyncSource.sync_type == SyncType.GOOGLE_DRIVE
        ).first()
        if not source or not source.oauth_tokens_json:
            logger.warning(f"No Google Drive credentials found for user {user_id}")
            return False

        import google.auth.transport.requests
        creds_info = json.loads(source.oauth_tokens_json)
        credentials = Credentials(
            token=creds_info.get("token"),
            refresh_token=creds_info.get("refresh_token"),
            token_uri=creds_info.get("token_uri"),
            client_id=creds_info.get("client_id"),
            client_secret=creds_info.get("client_secret"),
            scopes=creds_info.get("scopes")
        )
        if credentials.expired and credentials.refresh_token:
            req_refresh = google.auth.transport.requests.Request()
            credentials.refresh(req_refresh)
            source.oauth_tokens_json = credentials.to_json()
            db.commit()

        service = build("drive", "v3", credentials=credentials)
        if permanent:
            service.files().delete(fileId=file_id).execute()
        else:
            service.files().update(fileId=file_id, body={"trashed": True}).execute()
        logger.info(f"Successfully deleted/trashed file {file_id} (permanent={permanent}) in Google Drive for user {user_id}")
        return True
    except Exception as e:
        err_str = str(e).lower()
        if "404" in err_str or "not found" in err_str or "filenotfound" in err_str:
            logger.info(f"File {file_id} already absent in Google Drive: {e}")
            return True
        logger.error(f"Failed to delete file {file_id} from Google Drive: {e}")
        return False

def scan_google_drive_geotags(db: Session, user_id: int, max_photos: int = 2500, propagate_hours: float = 3.0) -> Dict[str, Any]:
    """
    Scans Google Drive photos for embedded GPS EXIF tags using lightweight 128KB in-memory range streaming.
    Resolves locations offline using GeoNames KD-Tree and optionally propagates to temporal photo clusters.
    """
    from app.services.scanner import extract_gps_from_bytes, reverse_geocode
    from concurrent.futures import ThreadPoolExecutor
    import urllib.request
    import google.auth.transport.requests
    from sqlalchemy import case

    source = db.query(SyncSource).filter(
        SyncSource.user_id == user_id,
        SyncSource.sync_type == SyncType.GOOGLE_DRIVE
    ).first()
    if not source:
        source = db.query(SyncSource).filter(SyncSource.sync_type == SyncType.GOOGLE_DRIVE).first()
    if not source or not source.oauth_tokens_json:
        return {"status": "error", "message": "No Google Drive credentials found for user", "newly_geotagged": 0}

    creds_info = json.loads(source.oauth_tokens_json)
    creds = Credentials(
        token=creds_info.get("token"),
        refresh_token=creds_info.get("refresh_token"),
        token_uri=creds_info.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=creds_info.get("client_id"),
        client_secret=creds_info.get("client_secret")
    )
    req = google.auth.transport.requests.Request()
    creds.refresh(req)

    # Query un-geotagged Google Drive photos, prioritizing smartphone photos
    photos = db.query(Media).filter(
        Media.user_id == user_id,
        Media.source_type == SourceType.GOOGLE_DRIVE,
        Media.latitude == None,
        Media.is_deleted == False
    ).order_by(
        case(
            (Media.camera_make.in_(['vivo', 'Xiaomi', 'samsung', 'Apple', 'motorola', 'OnePlus', 'Google']), 1),
            else_=2
        ),
        Media.captured_at.desc()
    ).limit(max_photos).all()

    if not photos:
        return {"status": "success", "message": "All Google Drive photos already scanned or geotagged", "newly_geotagged": 0}

    def fetch_gps_header(p_id: int, source_id: str):
        url = f"https://www.googleapis.com/drive/v3/files/{source_id}?alt=media"
        h_req = urllib.request.Request(url, headers={"Authorization": f"Bearer {creds.token}", "Range": "bytes=0-131071"})
        try:
            with urllib.request.urlopen(h_req, timeout=6) as resp:
                data = resp.read()
            coords = extract_gps_from_bytes(data)
            if coords:
                loc_name = reverse_geocode(coords[0], coords[1])
                return p_id, coords[0], coords[1], loc_name
        except Exception:
            pass
        return None

    results = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = [pool.submit(fetch_gps_header, p.id, p.source_id) for p in photos]
        for fut in futures:
            res = fut.result()
            if res:
                results.append(res)

    for p_id, lat, lon, loc_name in results:
        db.query(Media).filter(Media.id == p_id).update({
            "latitude": lat,
            "longitude": lon,
            "location_name": loc_name
        })
    db.commit()

    propagated = 0
    if propagate_hours and propagate_hours > 0 and len(results) > 0:
        propagated = propagate_locations_to_clusters(db, user_id=user_id, max_gap_hours=propagate_hours)

    return {
        "status": "success",
        "total_scanned": len(photos),
        "newly_geotagged": len(results),
        "propagated": propagated
    }

def propagate_locations_to_clusters(db: Session, user_id: int, max_gap_hours: float = 3.0) -> int:
    """Propagates location from geotagged anchor photos to un-geotagged photos taken during same outing/cluster."""
    anchors = db.query(Media).filter(
        Media.user_id == user_id,
        Media.latitude != None,
        Media.longitude != None,
        Media.captured_at != None,
        Media.is_deleted == False
    ).all()

    if not anchors:
        return 0

    non_geo = db.query(Media).filter(
        Media.user_id == user_id,
        Media.latitude == None,
        Media.captured_at != None,
        Media.is_deleted == False
    ).all()

    max_gap_seconds = max_gap_hours * 3600.0
    updated_count = 0

    for item in non_geo:
        best_anchor = None
        min_gap = max_gap_seconds
        for anc in anchors:
            gap = abs((item.captured_at - anc.captured_at).total_seconds())
            if gap <= min_gap:
                min_gap = gap
                best_anchor = anc

        if best_anchor:
            item.latitude = best_anchor.latitude
            item.longitude = best_anchor.longitude
            item.location_name = best_anchor.location_name
            updated_count += 1

    if updated_count > 0:
        db.commit()
    return updated_count

# ==============================================================================
# Google Drive Bulk Outbound Backup Engine
# ==============================================================================

def get_google_drive_service(db: Session, user_id: int):
    """
    Returns an authorized Google Drive v3 API service resource for the user.
    Refreshes expired access tokens automatically.
    """
    source = db.query(SyncSource).filter(
        SyncSource.user_id == user_id,
        SyncSource.sync_type == SyncType.GOOGLE_DRIVE
    ).order_by(SyncSource.id.desc()).first()

    if not source:
        # Fallback to any active Google Drive source if user is admin
        source = db.query(SyncSource).filter(
            SyncSource.sync_type == SyncType.GOOGLE_DRIVE
        ).order_by(SyncSource.id.desc()).first()

    if not source or not source.oauth_tokens_json:
        return None

    try:
        creds_info = json.loads(source.oauth_tokens_json)
        credentials = Credentials(
            token=creds_info.get("token"),
            refresh_token=creds_info.get("refresh_token"),
            token_uri=creds_info.get("token_uri") or "https://oauth2.googleapis.com/token",
            client_id=creds_info.get("client_id") or settings.GOOGLE_CLIENT_ID,
            client_secret=creds_info.get("client_secret") or settings.GOOGLE_CLIENT_SECRET,
            scopes=creds_info.get("scopes") or SCOPES
        )

        from google.auth.transport.requests import Request
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
            creds_info["token"] = credentials.token
            source.oauth_tokens_json = json.dumps(creds_info)
            db.commit()

        service = build("drive", "v3", credentials=credentials, cache_discovery=False)
        return service
    except Exception as e:
        logger.error(f"Failed to create Google Drive service: {e}")
        return None

def get_or_create_drive_folder(service, folder_path: str, parent_id: Optional[str] = None) -> str:
    """
    Resolves or creates a Google Drive folder hierarchy (e.g. 'MyMemoryPics/Vacations').
    Returns the target folder ID.
    """
    clean_path = folder_path.strip().strip("/\\")
    if not clean_path:
        clean_path = "MyMemoryPics_Backup"

    parts = [p.strip() for p in clean_path.split("/") if p.strip()]
    current_parent = parent_id

    for part in parts:
        safe_part = part.replace("'", "\\'")
        query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{safe_part}' and trashed = false"
        if current_parent:
            query += f" and '{current_parent}' in parents"
        else:
            query += " and 'root' in parents"

        res = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
        files = res.get('files', [])

        if files:
            current_parent = files[0]['id']
        else:
            meta = {
                'name': part,
                'mimeType': 'application/vnd.google-apps.folder'
            }
            if current_parent:
                meta['parents'] = [current_parent]
            created = service.files().create(body=meta, fields='id').execute()
            current_parent = created.get('id')

    return current_parent

def upload_media_to_drive(
    service,
    file_path: str,
    filename: str,
    mime_type: str,
    folder_id: str,
    captured_at: Optional[datetime] = None
) -> str:
    """
    Uploads a bit-for-bit lossless master file to Google Drive.
    Uses chunked resumable upload for files >= 10MB to guarantee stability.
    Returns the Drive File ID.
    """
    import time
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"Source master file not found at {file_path}")

    file_size = os.path.getsize(file_path)
    file_metadata = {
        'name': filename,
        'parents': [folder_id]
    }
    if captured_at:
        file_metadata['createdTime'] = captured_at.strftime("%Y-%m-%dT%H:%M:%SZ")

    is_large = file_size >= (10 * 1024 * 1024)
    media = MediaFileUpload(
        file_path,
        mimetype=mime_type or "application/octet-stream",
        resumable=is_large,
        chunksize=5 * 1024 * 1024 if is_large else -1
    )

    max_retries = 3
    for attempt in range(max_retries):
        try:
            if is_large:
                request = service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id, name, size'
                )
                response = None
                while response is None:
                    status, response = request.next_chunk()
                return response.get('id')
            else:
                uploaded = service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id, name, size'
                ).execute()
                return uploaded.get('id')
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            time.sleep(2 ** attempt)

def list_user_drive_folders(service, max_results: int = 50):
    """Returns top-level Google Drive folders for easy auto-complete selection."""
    try:
        query = "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        res = service.files().list(
            q=query,
            pageSize=max_results,
            fields="files(id, name, modifiedTime)",
            orderBy="modifiedTime desc"
        ).execute()
        return [{"id": f["id"], "name": f["name"]} for f in res.get("files", [])]
    except Exception as e:
        logger.warning(f"Failed to list drive folders: {e}")
        return []

