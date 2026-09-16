import time
import io
import re
import json
import logging
from typing import Dict, Any, Optional, Generator
from sqlalchemy.orm import Session

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

from app.models.sync import SyncSource, SyncType

logger = logging.getLogger(__name__)

# In-memory TTL cache for Google Drive CDN thumbnail links (TTL: 45 minutes, modeled after 9drive)
_DRIVE_THUMBNAIL_CACHE: Dict[str, Dict[str, Any]] = {}

def get_drive_service(db: Session):
    """Initializes Google Drive API service using stored OAuth credentials."""
    source = db.query(SyncSource).filter(SyncSource.sync_type == SyncType.GOOGLE_DRIVE).first()
    if not source or not source.oauth_tokens_json:
        return None

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
        return build("drive", "v3", credentials=credentials)
    except Exception as e:
        logger.error(f"Failed to build Google Drive client: {e}")
        return None

def get_google_drive_thumbnail_url(file_id: str, db: Session, size: int = 256) -> Optional[str]:
    """
    Retrieves high-speed Google CDN thumbnail link from in-memory cache or Google Drive API.
    Directly leverages Google's dynamic resizing parameter (=s{size}) with zero local disk usage.
    """
    now = time.time()
    cached = _DRIVE_THUMBNAIL_CACHE.get(file_id)
    if cached and cached.get("expires_at", 0) > now:
        base_url = cached["url"]
        return re.sub(r"=s\d+", f"=s{size}", base_url) if "=s" in base_url else f"{base_url}=s{size}"

    service = get_drive_service(db)
    if not service:
        return None

    try:
        meta = service.files().get(
            fileId=file_id,
            fields="thumbnailLink"
        ).execute()

        raw_url = meta.get("thumbnailLink")
        if raw_url:
            # Cache for 45 minutes (Google Drive CDN tokens remain valid for 1-2 hours)
            _DRIVE_THUMBNAIL_CACHE[file_id] = {
                "url": raw_url,
                "expires_at": now + (45 * 60)
            }
            return re.sub(r"=s\d+", f"=s{size}", raw_url) if "=s" in raw_url else f"{raw_url}=s{size}"
    except Exception as e:
        logger.warning(f"[drive_cache] Failed to fetch thumbnailLink for {file_id}: {e}")

    return None

_DRIVE_THUMBNAIL_BYTES_CACHE: Dict[str, bytes] = {}

def fetch_google_drive_thumbnail_bytes(file_id: str, db: Session, size: int = 256) -> Optional[bytes]:
    """
    Fetches Google Drive CDN thumbnail bytes server-side with in-memory caching.
    This bypasses Google's Referer 429 anti-hotlinking block by fetching without browser referrer headers.
    """
    cache_key = f"{file_id}_{size}"
    if cache_key in _DRIVE_THUMBNAIL_BYTES_CACHE:
        return _DRIVE_THUMBNAIL_BYTES_CACHE[cache_key]

    cdn_url = get_google_drive_thumbnail_url(file_id, db, size)
    if not cdn_url:
        return None

    try:
        import requests
        resp = requests.get(
            cdn_url,
            timeout=8,
            headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"
            }
        )
        if resp.status_code == 200 and resp.content:
            # Bound cache size to 1000 items (~15MB RAM)
            if len(_DRIVE_THUMBNAIL_BYTES_CACHE) > 1000:
                keys_to_evict = list(_DRIVE_THUMBNAIL_BYTES_CACHE.keys())[:200]
                for k in keys_to_evict:
                    _DRIVE_THUMBNAIL_BYTES_CACHE.pop(k, None)
            _DRIVE_THUMBNAIL_BYTES_CACHE[cache_key] = resp.content
            return resp.content
        else:
            logger.warning(f"[drive_cache] Google CDN returned status {resp.status_code} for {file_id}")
    except Exception as e:
        logger.warning(f"[drive_cache] Failed to fetch thumbnail bytes for {file_id}: {e}")

    return None

def cache_drive_thumbnail_link(file_id: str, thumbnail_link: str):
    """Populates in-memory cache directly from Google Drive files.list response."""
    if file_id and thumbnail_link:
        _DRIVE_THUMBNAIL_CACHE[file_id] = {
            "url": thumbnail_link,
            "expires_at": time.time() + (45 * 60)
        }

def stream_google_drive_file(file_id: str, db: Session, chunk_size: int = 1024 * 512) -> Generator[bytes, None, None]:
    """
    Streams the raw, uncompressed original photo directly from Google Drive API in-memory.
    Yields chunks to FastAPI StreamingResponse with zero disk persistence.
    """
    service = get_drive_service(db)
    if not service:
        raise RuntimeError("Google Drive service not available")

    request = service.files().get_media(fileId=file_id)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request, chunksize=chunk_size)
    
    done = False
    while not done:
        status, done = downloader.next_chunk()
        buffer.seek(0)
        chunk = buffer.read()
        if chunk:
            yield chunk
        buffer.seek(0)
        buffer.truncate(0)

def download_drive_file_to_memory(file_id: str, db: Session) -> Optional[io.BytesIO]:
    """
    Downloads an entire photo directly into an in-memory BytesIO buffer for instant AI processing.
    """
    service = get_drive_service(db)
    if not service:
        return None

    try:
        request = service.files().get_media(fileId=file_id)
        mem_buf = io.BytesIO()
        downloader = MediaIoBaseDownload(mem_buf, request, chunksize=1024 * 1024)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        mem_buf.seek(0)
        return mem_buf
    except Exception as e:
        logger.error(f"[drive_cache] Failed in-memory download for {file_id}: {e}")
        return None

def get_memory_cache_stats() -> Dict[str, Any]:
    """Returns telemetry on in-memory thumbnail and streaming caches."""
    now = time.time()
    active_entries = [k for k, v in _DRIVE_THUMBNAIL_CACHE.items() if v.get("expires_at", 0) > now]
    bytes_count = len(_DRIVE_THUMBNAIL_BYTES_CACHE)
    total_bytes = sum(len(b) for b in _DRIVE_THUMBNAIL_BYTES_CACHE.values())
    est_mb = round((len(active_entries) * 256 + total_bytes) / (1024.0 * 1024.0), 2)
    return {
        "cached_entries": len(active_entries) + bytes_count,
        "estimated_cache_mb": est_mb
    }

def clear_memory_cache() -> int:
    """Flushes all entries from in-memory cache."""
    count = len(_DRIVE_THUMBNAIL_CACHE) + len(_DRIVE_THUMBNAIL_BYTES_CACHE)
    _DRIVE_THUMBNAIL_CACHE.clear()
    _DRIVE_THUMBNAIL_BYTES_CACHE.clear()
    return count

