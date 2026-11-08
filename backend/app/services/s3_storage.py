import io
import os
import uuid
import hashlib
import logging
from typing import Optional, Dict, Any, List, Generator
from datetime import datetime

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from sqlalchemy.orm import Session

import imagehash
from app.config import settings
from app.models.media import Media, SourceType, MediaCategory
from app.services.scanner import extract_exif
from app.services.thumbnail import calculate_blurriness

logger = logging.getLogger(__name__)

_s3_client_singleton = None

def get_s3_client():
    """Initializes and returns a cached singleton S3 client for MinIO / S3."""
    global _s3_client_singleton
    if _s3_client_singleton is not None:
        return _s3_client_singleton
    _s3_client_singleton = boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        region_name=settings.S3_REGION_NAME
    )
    return _s3_client_singleton

def ensure_bucket_exists(bucket_name: Optional[str] = None) -> bool:
    """Ensures the target MinIO bucket exists; creates it if missing."""
    bucket = bucket_name or settings.S3_BUCKET_NAME
    s3 = get_s3_client()
    try:
        s3.head_bucket(Bucket=bucket)
        return True
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code in ["404", "NoSuchBucket"]:
            try:
                s3.create_bucket(Bucket=bucket)
                logger.info(f"Created MinIO bucket: {bucket}")
                return True
            except Exception as create_err:
                logger.error(f"Failed to create bucket {bucket}: {create_err}")
                return False
        else:
            logger.error(f"Error checking bucket {bucket}: {e}")
            return False
    except Exception as e:
        logger.error(f"Unexpected error connecting to MinIO: {e}")
        return False

def get_s3_status() -> Dict[str, Any]:
    """Inspects MinIO connectivity, bucket statistics, and object metrics."""
    s3 = get_s3_client()
    try:
        buckets_resp = s3.list_buckets()
        bucket_names = [b["Name"] for b in buckets_resp.get("Buckets", [])]
        
        target_bucket = settings.S3_BUCKET_NAME
        has_target = target_bucket in bucket_names
        
        if not has_target:
            has_target = ensure_bucket_exists(target_bucket)
            if has_target:
                bucket_names.append(target_bucket)

        objects_count = 0
        total_size = 0
        if has_target:
            paginator = s3.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=target_bucket):
                for obj in page.get("Contents", []):
                    objects_count += 1
                    total_size += obj.get("Size", 0)

        return {
            "connected": True,
            "endpoint_url": settings.S3_ENDPOINT_URL,
            "public_url": settings.S3_PUBLIC_URL,
            "console_url": settings.S3_CONSOLE_URL,
            "bucket_name": target_bucket,
            "all_buckets": bucket_names,
            "object_count": objects_count,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "region": settings.S3_REGION_NAME
        }
    except Exception as e:
        logger.warning(f"MinIO connection probe failed: {e}")
        return {
            "connected": False,
            "endpoint_url": settings.S3_ENDPOINT_URL,
            "public_url": settings.S3_PUBLIC_URL,
            "console_url": settings.S3_CONSOLE_URL,
            "bucket_name": settings.S3_BUCKET_NAME,
            "all_buckets": [],
            "object_count": 0,
            "total_size_bytes": 0,
            "total_size_mb": 0,
            "error": str(e)
        }

def upload_bytes_to_s3(
    data: bytes,
    key: str,
    content_type: str = "application/octet-stream",
    bucket_name: Optional[str] = None
) -> str:
    """Uploads in-memory bytes to MinIO/S3 object storage."""
    bucket = bucket_name or settings.S3_BUCKET_NAME
    ensure_bucket_exists(bucket)
    s3 = get_s3_client()
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType=content_type
    )
    return key

def get_s3_bytes(key: str, bucket_name: Optional[str] = None) -> bytes:
    """Retrieves full object bytes from MinIO/S3."""
    bucket = bucket_name or settings.S3_BUCKET_NAME
    s3 = get_s3_client()
    obj = s3.get_object(Bucket=bucket, Key=key)
    return obj["Body"].read()

def stream_s3_file(key: str, bucket_name: Optional[str] = None, chunk_size: int = 64 * 1024) -> Generator[bytes, None, None]:
    """Streams an object directly from MinIO without local disk consumption."""
    bucket = bucket_name or settings.S3_BUCKET_NAME
    s3 = get_s3_client()
    obj = s3.get_object(Bucket=bucket, Key=key)
    body = obj["Body"]
    while chunk := body.read(chunk_size):
        yield chunk

def generate_presigned_url(key: str, expiration: int = 3600, bucket_name: Optional[str] = None) -> str:
    """Generates a presigned URL for direct browser access."""
    bucket = bucket_name or settings.S3_BUCKET_NAME
    s3 = get_s3_client()
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expiration
    )
    # If client sees S3 via S3_PUBLIC_URL rather than internal Docker endpoint
    if settings.S3_PUBLIC_URL and settings.S3_ENDPOINT_URL in url:
        url = url.replace(settings.S3_ENDPOINT_URL, settings.S3_PUBLIC_URL)
    return url

def list_s3_objects(prefix: str = "", bucket_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """Lists objects in the bucket matching an optional prefix, safely handling missing buckets or connection errors."""
    bucket = bucket_name or settings.S3_BUCKET_NAME
    results = []
    try:
        s3 = get_s3_client()
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                results.append({
                    "key": item["Key"],
                    "size_bytes": item["Size"],
                    "size_kb": round(item["Size"] / 1024, 1),
                    "last_modified": item["LastModified"].isoformat(),
                    "etag": item.get("ETag", "").strip('"')
                })
        return sorted(results, key=lambda x: x["last_modified"], reverse=True)
    except Exception as e:
        logger.warning(f"Error listing S3 objects in bucket '{bucket}' with prefix '{prefix}': {e}")
        return []

def delete_s3_object(key: str, bucket_name: Optional[str] = None) -> bool:
    """Deletes an object from MinIO/S3."""
    bucket = bucket_name or settings.S3_BUCKET_NAME
    s3 = get_s3_client()
    try:
        s3.delete_object(Bucket=bucket, Key=key)
        return True
    except Exception as e:
        logger.error(f"Failed to delete S3 object {key}: {e}")
        return False

def backup_database_to_s3(db: Session, label: Optional[str] = None) -> Dict[str, Any]:
    """
    Creates a zero-downtime SQLite WAL backup and uploads the compressed archive
    directly into MinIO/S3 object storage under `backups/`.
    """
    from app.services.backup_service import create_wal_backup, get_backup_path
    
    # 1. Create local verified WAL backup snapshot
    meta = create_wal_backup(db, label=label or "s3_export")
    filename = meta["filename"]
    local_path = get_backup_path(filename)
    
    # 2. Upload to MinIO S3 via streaming upload without buffering archive into RAM
    s3_key = f"backups/{filename}"
    s3 = get_s3_client()
    ensure_bucket_exists(settings.S3_BUCKET_NAME)
    s3.upload_file(local_path, Bucket=settings.S3_BUCKET_NAME, Key=s3_key, ExtraArgs={"ContentType": "application/gzip"})
    logger.info(f"Uploaded database backup to MinIO: {s3_key}")
    
    meta["s3_key"] = s3_key
    meta["s3_bucket"] = settings.S3_BUCKET_NAME
    return meta

def ingest_photo_to_s3(
    db: Session,
    filename: str,
    content: bytes,
    category: Optional[str] = None,
    user_id: Optional[int] = None
) -> Media:
    """
    Directly ingests a photo into MinIO S3 object storage with in-memory analysis:
    - Segregates data into user-isolated folders: `users/{user_id}/photos/{uuid}_{filename}`
    - Generates 256px WebP thumbnail in-memory and uploads to `users/{user_id}/thumbnails/thumb_{uuid}.webp`
    - Parses EXIF, computes pHash & Laplacian sharpness variance in RAM
    - Inserts Media record into database with SourceType.S3_MINIO linked to user_id
    """
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None

    unique_id = uuid.uuid4().hex[:12]
    safe_name = os.path.basename(filename)
    user_prefix = f"users/{user_id}/" if user_id else "users/common/"
    object_key = f"{user_prefix}photos/{unique_id}_{safe_name}"
    thumb_key = f"{user_prefix}thumbnails/thumb_{unique_id}.webp"

    # 1. Upload original bytes to MinIO
    mime = "image/jpeg"
    lower = filename.lower()
    if lower.endswith(".png"):
        mime = "image/png"
    elif lower.endswith(".webp"):
        mime = "image/webp"
    elif lower.endswith(".heic"):
        mime = "image/heic"

    upload_bytes_to_s3(content, object_key, content_type=mime)

    # 2. In-memory thumbnail generation & upload
    thumb_bytes = None
    width = 0
    height = 0
    blur_score = 0.0
    is_blurry = False
    phash_str = None

    try:
        with Image.open(io.BytesIO(content)) as img:
            width, height = img.size
            img_rgb = img.convert("RGB")
            
            # Generate 256px thumbnail
            img_thumb = img_rgb.copy()
            img_thumb.thumbnail((256, 256), Image.Resampling.LANCZOS)
            thumb_buf = io.BytesIO()
            img_thumb.save(thumb_buf, format="WEBP", quality=85)
            thumb_bytes = thumb_buf.getvalue()

            # Compute pHash & blur
            phash_str = str(imagehash.phash(img_rgb))
            blur_score = calculate_blurriness(img_rgb)
            is_blurry = blur_score < 100.0
    except Exception as img_err:
        logger.warning(f"Error processing image metadata for S3 photo: {img_err}")

    if thumb_bytes:
        upload_bytes_to_s3(thumb_bytes, thumb_key, content_type="image/webp")

    # 3. Extract EXIF
    exif_data = extract_exif(content)
    captured_at = exif_data.get("captured_at") or datetime.utcnow()
    file_hash = hashlib.sha256(content).hexdigest()

    # 4. Create Media record
    media_category = MediaCategory.MEMORY
    if category:
        try:
            media_category = MediaCategory(category.lower())
        except ValueError:
            pass

    media_item = Media(
        user_id=user_id,
        filename=safe_name,
        original_path=f"s3://{settings.S3_BUCKET_NAME}/{object_key}",
        file_size=len(content),
        file_hash=file_hash,
        perceptual_hash=phash_str,
        mime_type=mime,
        width=width,
        height=height,
        captured_at=captured_at,
        camera_make=exif_data.get("camera_make"),
        camera_model=exif_data.get("camera_model"),
        focal_length=exif_data.get("focal_length"),
        exposure_time=exif_data.get("exposure_time"),
        iso=exif_data.get("iso"),
        latitude=exif_data.get("latitude"),
        longitude=exif_data.get("longitude"),
        location_name=exif_data.get("location_name"),
        thumbnail_256_path=thumb_key,
        thumbnail_1080_path=thumb_key,
        category=media_category,
        blurriness_score=blur_score,
        is_blurry=is_blurry,
        source_type=SourceType.S3_MINIO,
        source_id=object_key
    )

    db.add(media_item)
    db.commit()
    db.refresh(media_item)
    logger.info(f"Ingested photo to MinIO S3: id={media_item.id}, key={object_key}")
    return media_item
