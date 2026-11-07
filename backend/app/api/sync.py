import os
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.media import Media
from app.api.auth import get_current_user, get_optional_current_user
from app.models.sync import SyncSource, SyncType, SyncStatus
from app.services.scanner import scan_directory
from app.services.google_sync import (
    get_google_auth_url, 
    handle_oauth_callback, 
    run_google_drive_sync,
    get_google_drive_service,
    get_or_create_drive_folder,
    upload_media_to_drive,
    list_user_drive_folders
)
from app.config import settings

router = APIRouter()

class ScanLocalRequest(BaseModel):
    directory_path: Optional[str] = None
    async_mode: Optional[bool] = True

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
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Triggers recursive scan of a local directory, associating ingested media with primary user."""
    from app.services.task_queue import TaskQueue

    uid = current_user.id if current_user else 1
    target_dir = req.directory_path or settings.MEDIA_DIR

    # Default to background worker queue for non-blocking UI experience
    if req.async_mode is not False:
        task = TaskQueue.enqueue(
            "media_scan", 
            payload={"directory_path": target_dir, "user_id": uid},
            name=f"Storage Library Scanner ({os.path.basename(target_dir.rstrip('/'))})"
        )
        return {
            "status": "queued",
            "task_id": task.get("id") if task else None,
            "message": "Storage scan queued in background with live progress tracking.",
            "directory": target_dir
        }

    # Synchronous fallback
    result = scan_directory(db, target_dir, user_id=uid)
    if result.get("added", 0) > 0:
        try:
            TaskQueue.enqueue("clip_index_all")
            TaskQueue.enqueue("face_detect_all")
        except Exception:
            pass

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
    frontend_base = settings.FRONTEND_URL.rstrip('/')
    res = handle_oauth_callback(db, code, state)
    if res.get("status") == "error":
        err_msg = urllib.parse.quote(str(res.get("error", "Google authentication failed")))
        return RedirectResponse(url=f"{frontend_base}/login?error={err_msg}")
        
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
        return RedirectResponse(url=f"{frontend_base}/login?{query}")

    return RedirectResponse(url=f"{frontend_base}/sync?status=connected&syncing=1")

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

# ==============================================================================
# Outbound Google Drive Bulk Backup Endpoints
# ==============================================================================

class BackupPreCheckRequest(BaseModel):
    media_ids: List[int]

class BackupExecuteRequest(BaseModel):
    media_ids: List[int]
    folder_name: str
    force: bool = False

@router.get("/google/folders")
def get_drive_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lists available Google Drive folders for target backup selection."""
    service = get_google_drive_service(db, current_user.id)
    if not service:
        raise HTTPException(
            status_code=400,
            detail="Google Drive is not connected. Please connect your Google account in /sync."
        )
    return list_user_drive_folders(service)

@router.post("/google/backup/pre-check")
def backup_pre_check(
    req: BackupPreCheckRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Scans selected media IDs before backup:
    Detects which photos are already backed up vs ready for backup,
    preventing unwanted duplicate uploads across folders.
    """
    if not req.media_ids:
        return {
            "total_selected": 0,
            "ready_count": 0,
            "already_backed_up_count": 0,
            "ready_items": [],
            "already_backed_up_items": []
        }

    items = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        (Media.user_id == current_user.id) | (current_user.is_admin == True)
    ).all()

    ready = []
    already = []
    for item in items:
        if getattr(item, "is_backed_up_gdrive", False):
            already.append({
                "id": item.id,
                "filename": item.filename,
                "folder_name": getattr(item, "gdrive_backup_folder_name", "Google Drive"),
                "backed_up_at": item.gdrive_backed_up_at.isoformat() if getattr(item, "gdrive_backed_up_at", None) else None,
                "file_id": getattr(item, "gdrive_backup_file_id", None)
            })
        else:
            ready.append({
                "id": item.id,
                "filename": item.filename,
                "size": item.file_size
            })

    return {
        "total_selected": len(items),
        "ready_count": len(ready),
        "already_backed_up_count": len(already),
        "ready_items": ready,
        "already_backed_up_items": already
    }

@router.post("/google/backup")
def execute_google_backup(
    req: BackupExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Executes bulk backup of media items into the specified Google Drive folder.
    Skips items already backed up (unless force=True).
    Guarantees bit-for-bit lossless master storage with EXIF.
    """
    if not req.media_ids:
        raise HTTPException(status_code=400, detail="No media IDs specified for backup")

    folder_name = req.folder_name.strip()
    if not folder_name:
        folder_name = "MyMemoryPics_Backup"

    service = get_google_drive_service(db, current_user.id)
    if not service:
        raise HTTPException(
            status_code=400,
            detail="Google Drive is not connected. Please connect your Google account in /sync."
        )

    items = db.query(Media).filter(
        Media.id.in_(req.media_ids),
        (Media.user_id == current_user.id) | (current_user.is_admin == True)
    ).all()

    items_to_backup = []
    skipped_items = []
    for item in items:
        if getattr(item, "is_backed_up_gdrive", False) and not req.force:
            skipped_items.append({
                "id": item.id,
                "filename": item.filename,
                "reason": f"Already backed up to '{getattr(item, 'gdrive_backup_folder_name', 'Drive')}'"
            })
        else:
            items_to_backup.append(item)

    if not items_to_backup:
        return {
            "status": "success",
            "backed_up_count": 0,
            "skipped_count": len(skipped_items),
            "failed_count": 0,
            "folder_name": folder_name,
            "message": "All selected items are already backed up.",
            "skipped": skipped_items,
            "successful": [],
            "failed": []
        }

    try:
        folder_id = get_or_create_drive_folder(service, folder_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create or access Google Drive folder '{folder_name}': {e}")

    successful_backups = []
    failed_backups = []

    for item in items_to_backup:
        try:
            if not item.original_path or not os.path.isfile(item.original_path):
                failed_backups.append({
                    "id": item.id,
                    "filename": item.filename,
                    "error": "Original file not found on disk"
                })
                continue

            file_id = upload_media_to_drive(
                service=service,
                file_path=item.original_path,
                filename=item.filename,
                mime_type=item.mime_type or "image/jpeg",
                folder_id=folder_id,
                captured_at=item.captured_at
            )

            item.is_backed_up_gdrive = True
            item.gdrive_backup_file_id = file_id
            item.gdrive_backup_folder_id = folder_id
            item.gdrive_backup_folder_name = folder_name
            item.gdrive_backed_up_at = datetime.utcnow()
            db.commit()

            successful_backups.append({
                "id": item.id,
                "filename": item.filename,
                "file_id": file_id
            })
        except Exception as e:
            db.rollback()
            failed_backups.append({
                "id": item.id,
                "filename": item.filename,
                "error": str(e)
            })

    return {
        "status": "success",
        "backed_up_count": len(successful_backups),
        "skipped_count": len(skipped_items),
        "failed_count": len(failed_backups),
        "folder_name": folder_name,
        "folder_id": folder_id,
        "successful": successful_backups,
        "skipped": skipped_items,
        "failed": failed_backups
    }
