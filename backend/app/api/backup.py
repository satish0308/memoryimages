from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.api.auth import get_current_user
from app.services.backup_service import (
    create_wal_backup,
    list_backups,
    get_backup_path,
    delete_backup,
    restore_backup,
    restore_from_upload,
    get_schedule_settings,
    update_schedule_settings
)

router = APIRouter()

class BackupCreateRequest(BaseModel):
    label: Optional[str] = None

class ScheduleUpdateRequest(BaseModel):
    auto_backup_enabled: bool
    frequency: str = "daily"
    retention_count: int = 7

@router.get("")
def get_backups(current_user: User = Depends(get_current_user)):
    """Lists all available database backup snapshots with verification metadata."""
    return list_backups()

@router.post("")
def trigger_backup(
    req: Optional[BackupCreateRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Triggers an instant zero-downtime online SQLite WAL backup.
    Compresses with gzip and registers SHA-256 integrity checksum.
    """
    label = req.label if req else "manual"
    try:
        meta = create_wal_backup(db, label=label)
        return meta
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")

@router.get("/schedule")
def get_backup_schedule(current_user: User = Depends(get_current_user)):
    """Returns automated backup schedule configuration."""
    return get_schedule_settings()

@router.post("/schedule")
def set_backup_schedule(
    req: ScheduleUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    """Updates automated backup schedule policy and retention limits."""
    return update_schedule_settings(
        auto_backup_enabled=req.auto_backup_enabled,
        frequency=req.frequency,
        retention_count=req.retention_count
    )

@router.get("/{filename}/download")
def download_backup(filename: str, current_user: User = Depends(get_current_user)):
    """Downloads a backup snapshot archive to the client device."""
    try:
        path = get_backup_path(filename)
        return FileResponse(
            path=path,
            filename=filename,
            media_type="application/gzip"
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Backup file not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{filename}/restore")
def restore_snapshot(
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Performs point-in-time database restoration from a verified snapshot.
    Automatically creates a pre-restore safety snapshot before applying.
    """
    try:
        res = restore_backup(filename, db)
        return res
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Backup file not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Restore verification failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database restore failed: {str(e)}")

@router.post("/upload")
async def upload_and_restore(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Uploads a .db or .db.gz database backup and executes a point-in-time disaster recovery restore.
    """
    if not (file.filename.endswith(".db") or file.filename.endswith(".db.gz")):
        raise HTTPException(
            status_code=400,
            detail="Invalid backup format. Only .db or .db.gz files are accepted."
        )

    try:
        content = await file.read()
        res = restore_from_upload(content, file.filename, db)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload restore failed: {str(e)}")

@router.delete("/{filename}")
def delete_snapshot(filename: str, current_user: User = Depends(get_current_user)):
    """Permanently removes a backup snapshot archive."""
    try:
        deleted = delete_backup(filename)
        if not deleted:
            raise HTTPException(status_code=404, detail="Backup file not found")
        return {"status": "deleted", "filename": filename}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
