import os
import json
import shutil
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.setting import AppSetting
from app.config import settings

# Default system settings
DEFAULT_SETTINGS = {
    "storage_mode": {
        "value": "in_memory",
        "description": "Storage strategy: 'in_memory' (RAM buffer + Google Drive CDN) or 'local_disk' (volume mount caching)."
    },
    "local_storage_approved": {
        "value": "false",
        "description": "Explicit user approval required to create directories or store files on local disk/volume mount."
    },
    "use_google_cdn_thumbnails": {
        "value": "true",
        "description": "Serve thumbnails directly via Google Drive CDN (9drive architecture) without local disk writes."
    },
    "max_memory_cache_mb": {
        "value": "512",
        "description": "Maximum RAM allocation in megabytes for in-memory stream buffers."
    },
    "allowed_local_dirs": {
        "value": "[]",
        "description": "JSON array of explicitly approved local directory paths."
    }
}

# In-memory fast cache
_SETTINGS_CACHE: Dict[str, str] = {}

def get_setting(db: Session, key: str, default: Optional[str] = None) -> str:
    """Retrieves a configuration value from DB or cache, falling back to defaults."""
    if key in _SETTINGS_CACHE:
        return _SETTINGS_CACHE[key]

    setting = db.query(AppSetting).filter(AppSetting.key == key).first()
    if setting:
        _SETTINGS_CACHE[key] = setting.value
        return setting.value

    # Fallback to default
    if key in DEFAULT_SETTINGS:
        def_val = DEFAULT_SETTINGS[key]["value"]
        _SETTINGS_CACHE[key] = def_val
        return def_val

    return default or ""

def set_setting(db: Session, key: str, value: str, description: Optional[str] = None) -> AppSetting:
    """Persists a configuration value to the database and updates cache."""
    setting = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not setting:
        desc = description or DEFAULT_SETTINGS.get(key, {}).get("description")
        setting = AppSetting(key=key, value=str(value), description=desc)
        db.add(setting)
    else:
        setting.value = str(value)
        if description:
            setting.description = description

    db.commit()
    db.refresh(setting)
    _SETTINGS_CACHE[key] = setting.value
    return setting

def is_local_storage_approved(db: Session) -> bool:
    """Returns whether the user has explicitly authorized local disk/volume mount storage."""
    val = get_setting(db, "local_storage_approved", "false").strip().lower()
    return val in ("true", "1", "yes")

def get_storage_mode(db: Session) -> str:
    """
    Returns the active storage mode: 'in_memory' or 'local_disk'.
    If local storage is not approved, always enforces 'in_memory' to prevent unauthorized disk writes.
    """
    if not is_local_storage_approved(db):
        return "in_memory"
    return get_setting(db, "storage_mode", "in_memory").strip().lower()

def get_all_settings(db: Session) -> Dict[str, Any]:
    """Returns all settings consolidated with defaults and live system metrics."""
    result = {}
    for key, info in DEFAULT_SETTINGS.items():
        result[key] = get_setting(db, key, info["value"])

    # Cast boolean & integer types for frontend convenience
    return {
        "storage_mode": result["storage_mode"],
        "local_storage_approved": result["local_storage_approved"].lower() in ("true", "1", "yes"),
        "use_google_cdn_thumbnails": result["use_google_cdn_thumbnails"].lower() in ("true", "1", "yes"),
        "max_memory_cache_mb": int(result["max_memory_cache_mb"]) if result["max_memory_cache_mb"].isdigit() else 512,
        "allowed_local_dirs": json.loads(result["allowed_local_dirs"]) if result["allowed_local_dirs"].startswith("[") else [],
        "metrics": get_storage_metrics(db)
    }

def _get_dir_size_mb(path: str) -> float:
    """Helper to compute directory size in megabytes safely."""
    if not os.path.isdir(path):
        return 0.0
    total_bytes = 0
    try:
        for root, _, files in os.walk(path):
            for f in files:
                fp = os.path.join(root, f)
                if not os.path.islink(fp):
                    total_bytes += os.path.getsize(fp)
    except Exception:
        pass
    return round(total_bytes / (1024.0 * 1024.0), 2)

def get_storage_metrics(db: Session) -> Dict[str, Any]:
    """Calculates live storage consumption metrics across RAM and local volumes."""
    from app.services.drive_cache import get_memory_cache_stats

    originals_dir = settings.MEDIA_DIR
    thumbnails_dir = settings.THUMBNAIL_DIR

    orig_mb = _get_dir_size_mb(originals_dir)
    thumb_mb = _get_dir_size_mb(thumbnails_dir)
    total_disk_mb = round(orig_mb + thumb_mb, 2)

    mem_stats = get_memory_cache_stats()

    return {
        "active_storage_mode": get_storage_mode(db),
        "local_storage_approved": is_local_storage_approved(db),
        "memory_cache_entries": mem_stats["cached_entries"],
        "memory_cache_mb": mem_stats["estimated_cache_mb"],
        "local_originals_mb": orig_mb,
        "local_thumbnails_mb": thumb_mb,
        "total_local_disk_mb": total_disk_mb,
        "is_volume_mounted": os.path.exists("/data")
    }

def clear_cache(db: Session, clear_local_disk: bool = False) -> Dict[str, Any]:
    """
    Safely flushes in-memory cache and/or generated local WebP thumbnails.
    Note: Under zero auto-deletion policy, original photos are NEVER deleted.
    """
    from app.services.drive_cache import clear_memory_cache
    
    # 1. Clear in-memory cache
    memory_cleared = clear_memory_cache()

    # 2. Clear thumbnail cache on disk only if explicitly requested
    thumbnails_cleared = 0
    if clear_local_disk:
        thumb_dir = settings.THUMBNAIL_DIR
        if os.path.isdir(thumb_dir):
            for root, _, files in os.walk(thumb_dir):
                for f in files:
                    try:
                        os.remove(os.path.join(root, f))
                        thumbnails_cleared += 1
                    except Exception:
                        pass

    return {
        "status": "success",
        "memory_cache_entries_cleared": memory_cleared,
        "local_thumbnails_cleared": thumbnails_cleared,
        "metrics": get_storage_metrics(db)
    }
