from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.sync import SyncSource, SyncType, SyncStatus
from app.services.scanner import scan_directory
from app.services.google_sync import get_google_auth_url, handle_oauth_callback, run_google_drive_sync
from app.config import settings

router = APIRouter()

class ScanLocalRequest(BaseModel):
    directory_path: Optional[str] = None

@router.get("/sources")
def list_sync_sources(db: Session = Depends(get_db)):
    """Lists all configured local directories and Google Drive accounts."""
    return db.query(SyncSource).all()

@router.post("/scan-local")
def trigger_local_scan(
    req: ScanLocalRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Triggers recursive scan of a local directory."""
    target_dir = req.directory_path or settings.MEDIA_DIR
    # Run scan synchronously or schedule as background task
    result = scan_directory(db, target_dir)
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
def google_oauth_callback(code: str, db: Session = Depends(get_db)):
    """OAuth callback endpoint where Google redirects with the authorization code."""
    res = handle_oauth_callback(db, code)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("error"))
    return RedirectResponse(url="http://localhost:3000/sync?status=connected")

@router.post("/google/{source_id}/trigger")
def trigger_google_sync(source_id: int, db: Session = Depends(get_db)):
    """Manually triggers Google Drive synchronization."""
    result = run_google_drive_sync(db, source_id)
    return result
