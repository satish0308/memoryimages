import logging
import os
import signal
import sys
import time
import traceback
from datetime import datetime, timezone
from typing import Dict, Any

from app.config import settings
from app.database import SessionLocal, engine, Base
from app.models import media, person, sync, album, user
from app.services.task_queue import (
    TaskQueue,
    get_redis_client,
    TASK_QUEUE_KEY,
)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [Worker] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("memorypics.worker")

_should_exit = False

def handle_exit_signal(sig, frame):
    global _should_exit
    logger.info(f"Received shutdown signal ({sig}). Cleaning up and exiting...")
    _should_exit = True

signal.signal(signal.SIGINT, handle_exit_signal)
signal.signal(signal.SIGTERM, handle_exit_signal)


def run_clip_indexing(task_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generates CLIP ViT-B/32 multimodal vectors for all unindexed photos with step-by-step progress."""
    from app.models.media import Media, MediaEmbedding
    from app.services.clip_engine import get_image_model, embed_image
    import numpy as np

    with SessionLocal() as db:
        indexed_subquery = db.query(MediaEmbedding.media_id).subquery()
        unindexed = db.query(Media).filter(
            Media.is_deleted == False,
            ~Media.id.in_(indexed_subquery)
        ).all()

        total = len(unindexed)
        if total == 0:
            TaskQueue.update_task(
                task_id,
                progress=100,
                message="All photos already have CLIP embeddings. Nothing to index.",
                result={"indexed_count": 0, "total": 0}
            )
            return {"indexed_count": 0, "total": 0}

        TaskQueue.update_task(
            task_id,
            total_steps=total,
            current_step=0,
            progress=0,
            message=f"Starting CLIP indexing for {total} photos..."
        )

        model = get_image_model()
        indexed_count = 0

        for i, item in enumerate(unindexed):
            if _should_exit or TaskQueue.is_cancelled(task_id):
                logger.info(f"Task {task_id} cancelled during CLIP indexing.")
                return {"indexed_count": indexed_count, "cancelled": True}

            filename = item.filename or f"Photo #{item.id}"
            pct = int(((i + 1) / total) * 100)

            # Determine best available image path or thumbnail
            target_path = None
            if item.thumbnail_256_path and os.path.isfile(item.thumbnail_256_path):
                target_path = item.thumbnail_256_path
            elif item.original_path and os.path.isfile(item.original_path):
                target_path = item.original_path

            if target_path:
                try:
                    vec = embed_image(target_path)
                    if vec is not None:
                        emb = MediaEmbedding(media_id=item.id, vector=vec.tobytes(), embedding=vec.tolist())
                        db.add(emb)
                        db.commit()
                        indexed_count += 1
                except Exception as e:
                    logger.warning(f"Failed to embed photo #{item.id} ({filename}): {e}")
                    db.rollback()

            TaskQueue.update_task(
                task_id,
                progress=pct,
                current_step=i + 1,
                total_steps=total,
                message=f"Indexed {i + 1}/{total} ({pct}%): {filename}"
            )

        return {"indexed_count": indexed_count, "total": total}


def run_face_detection(task_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Runs UltraFace ONNX model across photos to detect and register facial bounding boxes."""
    from app.models.media import Media
    from app.models.person import FaceDetection
    from app.services.face_engine import detect_faces_in_image

    with SessionLocal() as db:
        # Check all non-deleted images
        photos = db.query(Media).filter(
            Media.is_deleted == False,
            Media.category == "Memory"
        ).all()

        total = len(photos)
        if total == 0:
            return {"photos_scanned": 0, "faces_detected": 0}

        TaskQueue.update_task(
            task_id,
            total_steps=total,
            current_step=0,
            progress=0,
            message=f"Starting UltraFace scan across {total} memories..."
        )

        detected_faces = 0
        photos_with_faces = 0

        for i, item in enumerate(photos):
            if _should_exit or TaskQueue.is_cancelled(task_id):
                return {"photos_scanned": i, "cancelled": True}

            filename = item.filename or f"Photo #{item.id}"
            pct = int(((i + 1) / total) * 100)

            # Skip if photo already has detections registered
            existing_count = db.query(FaceDetection).filter(FaceDetection.media_id == item.id).count()
            if existing_count == 0:
                target_path = item.original_path if (item.original_path and os.path.exists(item.original_path)) else item.thumbnail_1080_path
                if target_path and os.path.exists(target_path):
                    try:
                        faces = detect_faces_in_image(target_path)
                        for f in faces:
                            det = FaceDetection(
                                media_id=item.id,
                                box_x=f["box_x"],
                                box_y=f["box_y"],
                                box_w=f["box_w"],
                                box_h=f["box_h"],
                                confidence=f["confidence"]
                            )
                            db.add(det)
                        if faces:
                            detected_faces += len(faces)
                            photos_with_faces += 1
                        db.commit()
                    except Exception as e:
                        logger.warning(f"Error detecting faces in #{item.id}: {e}")
                        db.rollback()

            TaskQueue.update_task(
                task_id,
                progress=pct,
                current_step=i + 1,
                total_steps=total,
                message=f"Scanned {i + 1}/{total} ({pct}%): {detected_faces} faces found ({filename})"
            )

        return {"photos_scanned": total, "faces_detected": detected_faces, "photos_with_faces": photos_with_faces}


def run_face_clustering(task_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Clusters detected face crops into People using vision embeddings."""
    from app.services.face_engine import auto_cluster_faces

    TaskQueue.update_task(
        task_id,
        progress=20,
        message="Computing vision embeddings for detected face crops..."
    )

    with SessionLocal() as db:
        res = auto_cluster_faces(db)
        
        TaskQueue.update_task(
            task_id,
            progress=100,
            message=f"Clustering complete: {res.get('created_people', 0)} people created, {res.get('assigned_faces', 0)} faces assigned.",
            result=res
        )
        return res


def run_database_backup(task_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Runs automated zero-downtime database backup and exports to S3 if configured."""
    from app.services.backup_service import create_wal_backup

    TaskQueue.update_task(
        task_id,
        progress=30,
        message="Executing online zero-downtime database snapshot..."
    )

    with SessionLocal() as db:
        res = create_wal_backup(db, label=payload.get("label", "worker_backup"))
        TaskQueue.update_task(
            task_id,
            progress=100,
            message=f"Backup completed successfully: {res.get('filename')} ({res.get('size_bytes', 0) // 1024} KB).",
            result=res
        )
        return res


def run_media_scan(task_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Runs local filesystem scan to ingest new photos and generate WebP thumbnails."""
    from app.services.scanner import scan_directory

    TaskQueue.update_task(
        task_id,
        progress=10,
        message="Scanning storage directories for new media files..."
    )

    with SessionLocal() as db:
        res = scan_directory(db, settings.MEDIA_DIR)
        TaskQueue.update_task(
            task_id,
            progress=100,
            message=f"Scan complete: {res.get('new_files', 0)} new files, {res.get('processed_count', 0)} processed.",
            result=res
        )
        return res


def run_s3_sync(task_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Syncs photos with self-hosted MinIO S3 bucket."""
    from app.services.s3_storage import s3_storage

    TaskQueue.update_task(
        task_id,
        progress=20,
        message="Connecting to MinIO S3 bucket..."
    )

    with SessionLocal() as db:
        res = s3_storage.sync_bucket_to_db(db)
        TaskQueue.update_task(
            task_id,
            progress=100,
            message=f"S3 sync complete: {res.get('indexed_count', 0)} objects synced.",
            result=res
        )
        return res


DISPATCH_TABLE = {
    "clip_index_all": run_clip_indexing,
    "face_detect_all": run_face_detection,
    "face_cluster_all": run_face_clustering,
    "db_backup_create": run_database_backup,
    "media_scan": run_media_scan,
    "s3_sync_library": run_s3_sync,
}


def process_task(task_id: str):
    """Fetches task details, runs handler, and updates final status."""
    task = TaskQueue.get_task(task_id)
    if not task:
        logger.warning(f"Task {task_id} not found in queue.")
        return

    if TaskQueue.is_cancelled(task_id):
        logger.info(f"Task {task_id} was cancelled before starting.")
        TaskQueue.update_task(task_id, status="cancelled", message="Task cancelled before starting.")
        return

    task_type = task.get("type")
    handler = DISPATCH_TABLE.get(task_type)

    if not handler:
        err_msg = f"Unknown task type: {task_type}"
        logger.error(err_msg)
        TaskQueue.update_task(task_id, status="failed", error=err_msg, message=err_msg)
        return

    logger.info(f"Starting task {task_id}: {task.get('name')} ({task_type})")
    TaskQueue.update_task(
        task_id,
        status="running",
        message=f"Task started: {task.get('name')}",
        progress=0
    )

    start_time = time.time()
    try:
        result = handler(task_id, task.get("payload", {}))
        elapsed = round(time.time() - start_time, 2)

        if TaskQueue.is_cancelled(task_id) or (isinstance(result, dict) and result.get("cancelled")):
            TaskQueue.update_task(
                task_id,
                status="cancelled",
                message=f"Task cancelled after {elapsed}s."
            )
            logger.info(f"Task {task_id} cancelled ({elapsed}s).")
        else:
            TaskQueue.update_task(
                task_id,
                status="completed",
                progress=100,
                result=result,
                message=f"Finished in {elapsed}s."
            )
            logger.info(f"Task {task_id} completed successfully ({elapsed}s).")

    except Exception as e:
        elapsed = round(time.time() - start_time, 2)
        err_trace = traceback.format_exc()
        logger.error(f"Task {task_id} failed after {elapsed}s: {e}\n{err_trace}")
        TaskQueue.update_task(
            task_id,
            status="failed",
            error=str(e),
            message=f"Failed after {elapsed}s: {str(e)}"
        )


def main():
    logger.info("==========================================")
    logger.info("   MyMemoryPics Background AI Worker      ")
    logger.info(f"   Redis URL: {settings.REDIS_URL}       ")
    logger.info("==========================================")

    # Initialize database tables
    Base.metadata.create_all(bind=engine)

    redis_retry_delay = 2
    while not _should_exit:
        r = get_redis_client()
        if not r:
            logger.warning(f"Waiting for Redis at {settings.REDIS_URL}... retrying in {redis_retry_delay}s")
            time.sleep(redis_retry_delay)
            redis_retry_delay = min(10, redis_retry_delay * 1.5)
            continue

        redis_retry_delay = 2
        try:
            # Blocking pop from task queue (2s timeout to check _should_exit)
            item = r.blpop(TASK_QUEUE_KEY, timeout=2)
            if item:
                _, task_id = item
                process_task(task_id)
        except Exception as e:
            if not _should_exit:
                logger.error(f"Worker loop error: {e}")
                time.sleep(1)
        finally:
            try:
                r.close()
            except Exception:
                pass

    logger.info("Worker process exited gracefully.")


if __name__ == "__main__":
    main()
