from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.api.auth import get_current_user, get_optional_current_user
from app.services.s3_storage import (
    get_s3_status,
    ensure_bucket_exists,
    list_s3_objects,
    backup_database_to_s3,
    ingest_photo_to_s3,
    stream_s3_file,
    generate_presigned_url,
    delete_s3_object
)

router = APIRouter()

class BackupS3Request(BaseModel):
    label: Optional[str] = None

@router.get("/status")
def s3_status(current_user: Optional[User] = Depends(get_optional_current_user)):
    """Returns MinIO S3 connection status, metrics, and bucket details."""
    if not current_user:
        return {"connected": False, "authenticated": False, "message": "Sign in required to inspect S3 storage status"}
    return get_s3_status()

@router.post("/init-bucket")
def s3_init_bucket(current_user: User = Depends(get_current_user)):
    """Initializes the primary S3/MinIO bucket if not already existing."""
    success = ensure_bucket_exists()
    return {"status": "ok" if success else "failed", "bucket_initialized": success}

@router.get("/objects")
def s3_list_objects(
    prefix: str = Query("", description="Optional key prefix filter"),
    current_user: User = Depends(get_current_user)
):
    """
    Lists objects stored in MinIO/S3 strictly partitioned by account ID.
    Non-admin users can only view objects inside users/{current_user.id}/.
    """
    user_prefix = f"users/{current_user.id}/"
    if not current_user.is_admin:
        effective_prefix = f"{user_prefix}{prefix.lstrip('/')}"
    else:
        effective_prefix = prefix or user_prefix

    try:
        return list_s3_objects(prefix=effective_prefix)
    except Exception as e:
        return []

@router.post("/upload")
async def s3_upload_photos(
    files: List[UploadFile] = File(...),
    category: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Directly uploads photo files into MinIO S3 storage under account folder users/{user_id}/photos/,
    generates WebP thumbnails into users/{user_id}/thumbnails/, and catalogs them with user_id.
    """
    results = []
    for file in files:
        try:
            content = await file.read()
            media = ingest_photo_to_s3(
                db=db,
                filename=file.filename,
                content=content,
                category=category,
                user_id=current_user.id
            )
            results.append({
                "id": media.id,
                "user_id": current_user.id,
                "filename": media.filename,
                "s3_path": media.original_path,
                "size_bytes": media.file_size,
                "status": "ingested"
            })
        except Exception as e:
            results.append({
                "filename": file.filename,
                "status": "failed",
                "error": str(e)
            })

    return {
        "user_id": current_user.id,
        "total_uploaded": len([r for r in results if r["status"] == "ingested"]),
        "results": results
    }

@router.post("/backup-database")
def s3_backup_database(
    req: Optional[BackupS3Request] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Captures an online zero-downtime SQLite WAL snapshot and exports it
    directly to MinIO S3 object storage for disaster recovery. Admin only.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only administrators can initiate database backups.")
    label = req.label if req else "s3_archive"
    try:
        res = backup_database_to_s3(db, label=label)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 database backup failed: {str(e)}")

@router.get("/presigned/{object_key:path}")
def s3_get_presigned_url(
    object_key: str,
    expiration: int = Query(3600),
    current_user: User = Depends(get_current_user)
):
    """Generates a temporary presigned URL for direct browser access, enforcing account boundary."""
    expected_prefix = f"users/{current_user.id}/"
    if not current_user.is_admin and not object_key.startswith(expected_prefix):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cannot access objects outside your account partition."
        )
    try:
        url = generate_presigned_url(object_key, expiration=expiration)
        return {"object_key": object_key, "presigned_url": url, "expires_in": expiration}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/objects/{object_key:path}")
def s3_delete_object(
    object_key: str,
    current_user: User = Depends(get_current_user)
):
    """Deletes an object from MinIO/S3, enforcing strict account partition isolation."""
    expected_prefix = f"users/{current_user.id}/"
    if not current_user.is_admin and not object_key.startswith(expected_prefix):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cannot delete objects outside your account partition."
        )
    success = delete_s3_object(object_key)
    if not success:
        raise HTTPException(status_code=404, detail="Object not found or deletion failed")
    return {"status": "deleted", "object_key": object_key}
