from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
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
def s3_status():
    """Returns MinIO S3 connection status, metrics, and bucket details."""
    return get_s3_status()

@router.post("/init-bucket")
def s3_init_bucket():
    """Initializes the primary S3/MinIO bucket if not already existing."""
    success = ensure_bucket_exists()
    return {"status": "ok" if success else "failed", "bucket_initialized": success}

@router.get("/objects")
def s3_list_objects(prefix: str = Query("", description="Optional key prefix filter")):
    """Lists objects stored in the MinIO/S3 bucket."""
    return list_s3_objects(prefix=prefix)

@router.post("/upload")
async def s3_upload_photos(
    files: List[UploadFile] = File(...),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Directly uploads photo files into MinIO S3 storage, parses EXIF in-memory,
    generates WebP thumbnails into S3, and catalogs them in the database.
    """
    results = []
    for file in files:
        try:
            content = await file.read()
            media = ingest_photo_to_s3(db, file.filename, content, category=category)
            results.append({
                "id": media.id,
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
        "total_uploaded": len([r for r in results if r["status"] == "ingested"]),
        "results": results
    }

@router.post("/backup-database")
def s3_backup_database(
    req: Optional[BackupS3Request] = None,
    db: Session = Depends(get_db)
):
    """
    Captures an online zero-downtime SQLite WAL snapshot and exports it
    directly to MinIO S3 object storage for disaster recovery.
    """
    label = req.label if req else "s3_archive"
    try:
        res = backup_database_to_s3(db, label=label)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 database backup failed: {str(e)}")

@router.get("/presigned/{object_key:path}")
def s3_get_presigned_url(object_key: str, expiration: int = Query(3600)):
    """Generates a temporary presigned URL for direct browser access."""
    try:
        url = generate_presigned_url(object_key, expiration=expiration)
        return {"object_key": object_key, "presigned_url": url, "expires_in": expiration}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/objects/{object_key:path}")
def s3_delete_object(object_key: str):
    """Deletes an object from MinIO/S3 object storage."""
    success = delete_s3_object(object_key)
    if not success:
        raise HTTPException(status_code=404, detail="Object not found or deletion failed")
    return {"status": "deleted", "object_key": object_key}
