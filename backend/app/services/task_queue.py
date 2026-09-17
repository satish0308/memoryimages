import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from app.config import settings

logger = logging.getLogger("memorypics.task_queue")

TASK_QUEUE_KEY = "memorypics:tasks:queue"
TASK_HISTORY_KEY = "memorypics:tasks:history"
TASK_DATA_PREFIX = "memorypics:task:"
TASK_CANCEL_PREFIX = "memorypics:cancel:"
TASK_EVENTS_CHANNEL = "memorypics:events:tasks"

# In-memory fallback if Redis is unreachable
_memory_tasks: Dict[str, Dict[str, Any]] = {}
_memory_queue: List[str] = []
_memory_history: List[str] = []

TASK_NAMES = {
    "clip_index_all": "CLIP Semantic Vector Indexing",
    "face_detect_all": "UltraFace Face Detection",
    "face_cluster_all": "Vision Person Face Clustering",
    "db_backup_create": "Automated Database Backup",
    "media_scan": "Storage Library Scanner",
    "s3_sync_library": "MinIO S3 Library Sync",
    "mood_analysis_all": "AI Emotion, Mood & Color Analysis",
    "video_index_all": "Video Keyframe AI Search Indexing",
}

def get_redis_client():
    """Returns a synchronous Redis client with connection error handling."""
    try:
        import redis
        client = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=3)
        client.ping()
        return client
    except Exception as e:
        logger.debug(f"Redis not available: {e}")
        return None

async def get_async_redis_client():
    """Returns an asynchronous Redis client with connection error handling."""
    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=3)
        await client.ping()
        return client
    except Exception as e:
        logger.debug(f"Async Redis not available: {e}")
        return None

class TaskQueue:
    @staticmethod
    def is_redis_available() -> bool:
        client = get_redis_client()
        if client:
            try:
                client.close()
                return True
            except Exception:
                return False
        return False

    @staticmethod
    def enqueue(task_type: str, payload: Optional[Dict[str, Any]] = None, name: Optional[str] = None) -> Dict[str, Any]:
        task_id = f"task_{uuid.uuid4().hex[:8]}"
        human_name = name or TASK_NAMES.get(task_type, task_type.replace("_", " ").title())
        now = datetime.now(timezone.utc).isoformat()
        
        task_data = {
            "id": task_id,
            "type": task_type,
            "name": human_name,
            "status": "pending",
            "progress": 0,
            "current_step": 0,
            "total_steps": 0,
            "message": "Queued and waiting for background worker...",
            "error": None,
            "payload": payload or {},
            "result": None,
            "created_at": now,
            "started_at": None,
            "completed_at": None,
        }

        r = get_redis_client()
        if r:
            try:
                pipe = r.pipeline()
                pipe.set(f"{TASK_DATA_PREFIX}{task_id}", json.dumps(task_data), ex=86400 * 3) # 3 days TTL
                pipe.rpush(TASK_QUEUE_KEY, task_id)
                pipe.lpush(TASK_HISTORY_KEY, task_id)
                pipe.ltrim(TASK_HISTORY_KEY, 0, 99) # Keep last 100
                pipe.publish(TASK_EVENTS_CHANNEL, json.dumps({"event": "task_queued", "task": task_data}))
                pipe.execute()
                r.close()
                logger.info(f"Task {task_id} ({task_type}) enqueued to Redis.")
                return task_data
            except Exception as e:
                logger.error(f"Failed to enqueue task to Redis: {e}")

        # Fallback to in-memory queue
        _memory_tasks[task_id] = task_data
        _memory_queue.append(task_id)
        _memory_history.insert(0, task_id)
        if len(_memory_history) > 100:
            _memory_history.pop()
        logger.info(f"Task {task_id} ({task_type}) enqueued to local in-memory queue.")
        return task_data

    @staticmethod
    def get_task(task_id: str) -> Optional[Dict[str, Any]]:
        r = get_redis_client()
        if r:
            try:
                raw = r.get(f"{TASK_DATA_PREFIX}{task_id}")
                r.close()
                if raw:
                    return json.loads(raw)
            except Exception as e:
                logger.error(f"Error fetching task {task_id} from Redis: {e}")
        return _memory_tasks.get(task_id)

    @staticmethod
    def update_task(
        task_id: str,
        status: Optional[str] = None,
        progress: Optional[int] = None,
        current_step: Optional[int] = None,
        total_steps: Optional[int] = None,
        message: Optional[str] = None,
        error: Optional[str] = None,
        result: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        task = TaskQueue.get_task(task_id)
        if not task:
            return None

        now = datetime.now(timezone.utc).isoformat()
        if status:
            task["status"] = status
            if status == "running" and not task.get("started_at"):
                task["started_at"] = now
            elif status in ("completed", "failed", "cancelled"):
                task["completed_at"] = now
        
        if progress is not None:
            task["progress"] = min(100, max(0, progress))
        if current_step is not None:
            task["current_step"] = current_step
        if total_steps is not None:
            task["total_steps"] = total_steps
        if message is not None:
            task["message"] = message
        if error is not None:
            task["error"] = error
        if result is not None:
            task["result"] = result

        r = get_redis_client()
        if r:
            try:
                r.set(f"{TASK_DATA_PREFIX}{task_id}", json.dumps(task, default=str), ex=86400 * 3)
                r.publish(TASK_EVENTS_CHANNEL, json.dumps({"event": "task_update", "task": task}, default=str))
                r.close()
            except Exception as e:
                logger.error(f"Failed to update task {task_id} in Redis: {e}")

        _memory_tasks[task_id] = task
        return task

    @staticmethod
    def is_cancelled(task_id: str) -> bool:
        r = get_redis_client()
        if r:
            try:
                val = r.get(f"{TASK_CANCEL_PREFIX}{task_id}")
                r.close()
                return val == "1"
            except Exception:
                pass
        task = _memory_tasks.get(task_id)
        return task.get("status") == "cancelled" if task else False

    @staticmethod
    def cancel_task(task_id: str) -> bool:
        r = get_redis_client()
        if r:
            try:
                r.set(f"{TASK_CANCEL_PREFIX}{task_id}", "1", ex=3600)
                r.close()
            except Exception as e:
                logger.error(f"Failed to set cancel flag in Redis: {e}")
        
        task = TaskQueue.update_task(
            task_id, 
            status="cancelled", 
            message="Task cancellation requested by user."
        )
        return task is not None

    @staticmethod
    def list_active() -> List[Dict[str, Any]]:
        """Returns all running and pending tasks."""
        tasks = []
        r = get_redis_client()
        if r:
            try:
                recent_ids = r.lrange(TASK_HISTORY_KEY, 0, 50)
                if recent_ids:
                    keys = [f"{TASK_DATA_PREFIX}{tid}" for tid in recent_ids]
                    raw_tasks = r.mget(keys)
                    for raw in raw_tasks:
                        if raw:
                            try:
                                t = json.loads(raw)
                                if t.get("status") in ("pending", "running"):
                                    tasks.append(t)
                            except Exception:
                                pass
                r.close()
                return tasks
            except Exception as e:
                logger.error(f"Error listing active tasks from Redis: {e}")
                try:
                    r.close()
                except Exception:
                    pass

        # In-memory fallback
        for tid in _memory_queue:
            t = _memory_tasks.get(tid)
            if t and t.get("status") in ("pending", "running"):
                tasks.append(t)
        return tasks

    @staticmethod
    def list_recent(limit: int = 20) -> List[Dict[str, Any]]:
        """Returns recently completed/failed/cancelled tasks."""
        tasks = []
        r = get_redis_client()
        if r:
            try:
                recent_ids = r.lrange(TASK_HISTORY_KEY, 0, limit * 2)
                if recent_ids:
                    keys = [f"{TASK_DATA_PREFIX}{tid}" for tid in recent_ids]
                    raw_tasks = r.mget(keys)
                    for raw in raw_tasks:
                        if raw:
                            try:
                                t = json.loads(raw)
                                if t.get("status") not in ("pending", "running"):
                                    tasks.append(t)
                                if len(tasks) >= limit:
                                    break
                            except Exception:
                                pass
                r.close()
                return tasks
            except Exception as e:
                logger.error(f"Error listing recent tasks from Redis: {e}")
                try:
                    r.close()
                except Exception:
                    pass

        for tid in _memory_history:
            t = _memory_tasks.get(tid)
            if t and t.get("status") not in ("pending", "running"):
                tasks.append(t)
            if len(tasks) >= limit:
                break
        return tasks

    @staticmethod
    def clear_history() -> int:
        count = 0
        r = get_redis_client()
        if r:
            try:
                recent_ids = r.lrange(TASK_HISTORY_KEY, 0, 100)
                pipe = r.pipeline()
                for tid in recent_ids:
                    t = TaskQueue.get_task(tid)
                    if t and t.get("status") in ("completed", "failed", "cancelled"):
                        pipe.delete(f"{TASK_DATA_PREFIX}{tid}")
                        pipe.lrem(TASK_HISTORY_KEY, 0, tid)
                        count += 1
                pipe.execute()
                r.close()
                return count
            except Exception as e:
                logger.error(f"Error clearing task history in Redis: {e}")

        for tid in list(_memory_history):
            t = _memory_tasks.get(tid)
            if t and t.get("status") in ("completed", "failed", "cancelled"):
                _memory_tasks.pop(tid, None)
                _memory_history.remove(tid)
                count += 1
        return count
