from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.api.auth import get_current_user, get_optional_current_user
from app.models.sync import SyncSource, SyncType, SyncStatus
from app.services.scanner import scan_directory
from app.services.google_sync import get_google_auth_url, handle_oauth_callback, run_google_drive_sync
from app.config import settings

router = APIRouter()

class ScanLocalRequest(BaseModel):
    directory_path: Optional[str] = None

@router.get("/sources")
def list_sync_sources(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Lists sync sources configured for the current user (or all if admin)."""
    if not current_user:
        return []
    if current_user.is_admin:
        return db.query(SyncSource).all()
    return db.query(SyncSource).filter(SyncSource.user_id == current_user.id).all()

@router.post("/scan-local")
def trigger_local_scan(
    req: ScanLocalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Triggers recursive scan of a local directory, associating ingested media with current user."""
    target_dir = req.directory_path or settings.MEDIA_DIR
    result = scan_directory(db, target_dir, user_id=current_user.id)
    return {
        "status": "scan_completed",
        "directory": target_dir,
        "details": result
    }

@router.get("/google/auth-url")
def get_google_oauth_url():
    """Generates the Google OAuth authorization URL for Google Drive sync."""
    result = get_google_auth_url()
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

from fastapi.responses import RedirectResponse

@router.get("/google/callback")
def google_oauth_callback(
    code: str,
    state: Optional[str] = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """OAuth callback endpoint where Google redirects with the authorization code."""
    import urllib.parse
    res = handle_oauth_callback(db, code, state)
    if res.get("status") == "error":
        err_msg = urllib.parse.quote(str(res.get("error", "Google authentication failed")))
        return RedirectResponse(url=f"http://localhost:3000/login?error={err_msg}")
        
    token = res.get("access_token")
    user = res.get("user")
    user_id = user.get("id") if user else None

    source_id = res.get("source_id")
    if source_id:
        background_tasks.add_task(run_google_drive_sync, db, source_id, user_id=user_id)
    if token and user:
        query = urllib.parse.urlencode({
            "token": token,
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "full_name": user.get("full_name") or "",
            "is_admin": "true" if user.get("is_admin") else "false",
            "provider": "google"
        })
        return RedirectResponse(url=f"http://localhost:3000/login?{query}")

    return RedirectResponse(url="http://localhost:3000/sync?status=connected&syncing=1")

@router.post("/google/{source_id}/trigger")
def trigger_google_sync(
    source_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually triggers Google Drive synchronization for current user."""
    source = db.query(SyncSource).filter(SyncSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Sync source not found")
    if source.user_id and source.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    result = run_google_drive_sync(db, source_id, user_id=current_user.id)
    return result
