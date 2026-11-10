import json
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.api.auth import get_current_user
from app.services.settings_service import (
    get_all_settings,
    set_setting,
    get_storage_metrics,
    clear_cache,
    is_local_storage_approved
)

router = APIRouter()

class UpdateSettingsRequest(BaseModel):
    storage_mode: Optional[str] = None # "in_memory" or "local_disk"
    local_storage_approved: Optional[bool] = None
    use_google_cdn_thumbnails: Optional[bool] = None
    max_memory_cache_mb: Optional[int] = None
    allowed_local_dirs: Optional[List[str]] = None

    # AI & Face Recognition
    face_similarity_threshold: Optional[float] = None
    face_recognition_global: Optional[bool] = None
    face_detection_confidence: Optional[float] = None

    # Semantic Vector Search
    semantic_search_min_similarity: Optional[float] = None

    # Smart Triage & Quality
    blur_laplacian_threshold: Optional[float] = None
    duplicate_distance_threshold: Optional[int] = None
    screenshot_expiry_days: Optional[int] = None

class ApprovalRequest(BaseModel):
    approved: bool
    confirmation: str # Must equal "I approve local disk storage" to prevent accidental clicks

class ClearCacheRequest(BaseModel):
    clear_memory: bool = True
    clear_local_disk_thumbnails: bool = False

@router.get("")
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns all application settings and live telemetry on RAM/disk storage."""
    return get_all_settings(db)

@router.put("")
def update_settings(
    req: UpdateSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Updates storage policy, CDN toggles, and memory limits."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin authorization required")
    # Safety constraint: switching to local_disk requires local_storage_approved to be true
    if req.storage_mode == "local_disk":
        currently_approved = req.local_storage_approved if req.local_storage_approved is not None else is_local_storage_approved(db)
        if not currently_approved:
            raise HTTPException(
                status_code=400,
                detail="Local storage is not approved. Please authorize local disk writes before selecting 'local_disk' mode."
            )

    if req.storage_mode is not None:
        if req.storage_mode not in ("in_memory", "local_disk"):
            raise HTTPException(status_code=400, detail="Invalid storage_mode. Must be 'in_memory' or 'local_disk'.")
        set_setting(db, "storage_mode", req.storage_mode)

    if req.local_storage_approved is not None:
        set_setting(db, "local_storage_approved", "true" if req.local_storage_approved else "false")
        # If approval revoked, automatically force back to in_memory
        if not req.local_storage_approved:
            set_setting(db, "storage_mode", "in_memory")

    if req.use_google_cdn_thumbnails is not None:
        set_setting(db, "use_google_cdn_thumbnails", "true" if req.use_google_cdn_thumbnails else "false")

    if req.max_memory_cache_mb is not None:
        set_setting(db, "max_memory_cache_mb", str(max(64, min(req.max_memory_cache_mb, 8192))))

    if req.allowed_local_dirs is not None:
        set_setting(db, "allowed_local_dirs", json.dumps(req.allowed_local_dirs))

    # AI & Face Recognition
    if req.face_similarity_threshold is not None:
        val = max(0.20, min(req.face_similarity_threshold, 0.90))
        set_setting(db, "face_similarity_threshold", f"{val:.2f}")

    if req.face_recognition_global is not None:
        set_setting(db, "face_recognition_global", "true" if req.face_recognition_global else "false")

    if req.face_detection_confidence is not None:
        val = max(0.10, min(req.face_detection_confidence, 0.90))
        set_setting(db, "face_detection_confidence", f"{val:.2f}")

    # Semantic Vector Search
    if req.semantic_search_min_similarity is not None:
        val = max(0.05, min(req.semantic_search_min_similarity, 0.60))
        set_setting(db, "semantic_search_min_similarity", f"{val:.2f}")

    # Smart Triage & Quality
    if req.blur_laplacian_threshold is not None:
        val = max(10.0, min(req.blur_laplacian_threshold, 300.0))
        set_setting(db, "blur_laplacian_threshold", f"{val:.1f}")

    if req.duplicate_distance_threshold is not None:
        val = max(1, min(req.duplicate_distance_threshold, 30))
        set_setting(db, "duplicate_distance_threshold", str(val))

    if req.screenshot_expiry_days is not None:
        val = max(1, min(req.screenshot_expiry_days, 365))
        set_setting(db, "screenshot_expiry_days", str(val))

    return {
        "status": "success",
        "settings": get_all_settings(db)
    }

@router.post("/approve-local-storage")
def set_local_storage_approval(
    req: ApprovalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Explicit authorization endpoint to approve or revoke local storage and directory creation.
    Requires text confirmation for approval.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin authorization required")
    if req.approved:
        if req.confirmation.strip().lower() != "i approve local disk storage":
            raise HTTPException(
                status_code=400,
                detail="Confirmation mismatch. Type 'I approve local disk storage' to authorize volume mount writes."
            )
        set_setting(db, "local_storage_approved", "true")
    else:
        set_setting(db, "local_storage_approved", "false")
        set_setting(db, "storage_mode", "in_memory")

    return {
        "status": "success",
        "local_storage_approved": req.approved,
        "active_storage_mode": "local_disk" if req.approved else "in_memory"
    }

@router.post("/clear-cache")
def clear_application_cache(
    req: ClearCacheRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Purges in-memory stream buffer cache and/or generated local WebP thumbnails.
    Original photos are strictly preserved (zero auto-deletion policy).
    """
    result = clear_cache(db, clear_local_disk=req.clear_local_disk_thumbnails)
    return result

@router.get("/metrics")
def get_storage_metrics_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns live storage statistics across RAM cache, originals, and thumbnails."""
    return get_storage_metrics(db)
