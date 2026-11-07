import os
import time
import logging
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileMovedEvent

from app.config import settings
from app.database import SessionLocal
from app.services.scanner import scan_file, SUPPORTED_EXTENSIONS
from app.models.media import SourceType

logger = logging.getLogger(__name__)

class PhotoWatcherHandler(FileSystemEventHandler):
    """
    Watches /data/originals and automatically processes incoming photos
    in real time without requiring manual user scan triggers.
    """
    def __init__(self):
        super().__init__()

    def _process_file(self, file_path: str):
        # Wait slightly for file to finish writing (e.g. large file copy)
        time.sleep(0.5)
        ext = os.path.splitext(file_path)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            return
            
        db = SessionLocal()
        try:
            from app.models.user import User
            primary_user = db.query(User).order_by(User.id.asc()).first()
            uid = primary_user.id if primary_user else 1
            media = scan_file(db, file_path, source_type=SourceType.LOCAL, user_id=uid)
            if media:
                logger.info(f"Auto-ingested new media from watcher: {media.filename} (ID: {media.id})")
                try:
                    from app.services.task_queue import TaskQueue
                    TaskQueue.enqueue("clip_index_all")
                    TaskQueue.enqueue("face_detect_all")
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error auto-ingesting {file_path}: {e}")
        finally:
            db.close()

    def on_created(self, event):
        if not event.is_directory:
            self._process_file(event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            self._process_file(event.dest_path)

_observer = None

def start_watcher(watch_dir: str = settings.MEDIA_DIR):
    """Starts the background directory watcher."""
    global _observer
    if not os.path.exists(watch_dir):
        os.makedirs(watch_dir, exist_ok=True)

    event_handler = PhotoWatcherHandler()
    _observer = Observer()
    _observer.schedule(event_handler, watch_dir, recursive=True)
    _observer.daemon = True
    _observer.start()
    logger.info(f"Started continuous directory watcher on: {watch_dir}")

def stop_watcher():
    """Stops the background directory watcher."""
    global _observer
    if _observer:
        _observer.stop()
        _observer.join()
        _observer = None
