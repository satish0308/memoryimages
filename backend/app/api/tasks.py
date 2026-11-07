import asyncio
import json
import logging
import time
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends
from pydantic import BaseModel

from app.services.task_queue import (
    TaskQueue,
    TASK_NAMES,
    TASK_EVENTS_CHANNEL,
    get_async_redis_client,
)

logger = logging.getLogger("memorypics.tasks_api")

router = APIRouter()

class TaskDispatchRequest(BaseModel):
    task_type: str
    params: Optional[Dict[str, Any]] = None
    name: Optional[str] = None

@router.get("/active")
def get_active_tasks():
    """Returns currently running/pending tasks and recent task history."""
    return {
        "active": TaskQueue.list_active(),
        "recent": TaskQueue.list_recent(limit=15),
        "redis_available": TaskQueue.is_redis_available(),
        "available_types": list(TASK_NAMES.keys()),
    }

@router.get("/{task_id}")
def get_task_status(task_id: str):
    """Returns status and progress of a specific task."""
    task = TaskQueue.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.post("/dispatch")
def dispatch_task(req: TaskDispatchRequest):
    """Enqueues a new background task for the worker to execute."""
    if req.task_type not in TASK_NAMES:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid task_type '{req.task_type}'. Must be one of: {list(TASK_NAMES.keys())}"
        )

    task = TaskQueue.enqueue(
        task_type=req.task_type,
        payload=req.params,
        name=req.name
    )
    return task

@router.post("/{task_id}/cancel")
def cancel_task(task_id: str):
    """Signals cancellation for a running or pending task."""
    task = TaskQueue.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    success = TaskQueue.cancel_task(task_id)
    return {"success": success, "task_id": task_id}

@router.post("/deduplicate")
def deduplicate_tasks():
    """Removes all redundant pending singleton tasks from queue and syncs active list."""
    removed = TaskQueue.deduplicate_queue()
    return {"status": "deduplicated", "removed_count": removed}

@router.delete("/history")
def clear_task_history():
    """Clears completed/failed tasks from history."""
    cleared = TaskQueue.clear_history()
    # Also clean up any lingering duplicates
    TaskQueue.deduplicate_queue()
    return {"cleared_count": cleared}

@router.websocket("/ws")
async def websocket_tasks_endpoint(websocket: WebSocket):
    """
    Real-time WebSocket endpoint streaming task progress, queue updates,
    and completions via Redis PubSub with in-memory fallback polling.
    """
    await websocket.accept()
    logger.info("Task WebSocket client connected.")

    # Send initial snapshot immediately upon connect
    try:
        init_payload = {
            "event": "init",
            "active": TaskQueue.list_active(),
            "recent": TaskQueue.list_recent(limit=15),
            "redis_available": TaskQueue.is_redis_available(),
        }
        await websocket.send_text(json.dumps(init_payload, default=str))
    except Exception as e:
        logger.warning(f"Error sending WebSocket initial payload: {e}")
        return

    r = await get_async_redis_client()
    pubsub = None
    if r:
        try:
            pubsub = r.pubsub()
            await pubsub.subscribe(TASK_EVENTS_CHANNEL)
            logger.info(f"WebSocket subscribed to Redis channel: {TASK_EVENTS_CHANNEL}")
        except Exception as e:
            logger.warning(f"Failed to subscribe to Redis: {e}")
            pubsub = None

    async def client_receiver():
        while True:
            msg = await websocket.receive_text()
            try:
                parsed = json.loads(msg)
                if parsed.get("action") == "ping":
                    await websocket.send_text(json.dumps({"event": "pong"}))
            except Exception:
                pass

    async def pubsub_sender():
        if pubsub:
            async for message in pubsub.listen():
                if message and message.get("type") == "message":
                    data = message.get("data")
                    if data:
                        await websocket.send_text(data)
        else:
            # In-memory fallback: sync every 2.0 seconds
            while True:
                await asyncio.sleep(2.0)
                snapshot = json.dumps({
                    "event": "sync",
                    "active": TaskQueue.list_active(),
                    "recent": TaskQueue.list_recent(limit=15),
                }, default=str)
                await websocket.send_text(snapshot)

    recv_task = asyncio.create_task(client_receiver())
    send_task = asyncio.create_task(pubsub_sender())

    try:
        done, pending = await asyncio.wait(
            [recv_task, send_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
    except (WebSocketDisconnect, asyncio.CancelledError):
        logger.info("Task WebSocket client disconnected.")
    except Exception as e:
        logger.warning(f"Task WebSocket connection closed: {e}")
    finally:
        recv_task.cancel()
        send_task.cancel()
        if pubsub and r:
            try:
                await pubsub.unsubscribe(TASK_EVENTS_CHANNEL)
                await pubsub.close()
                await r.close()
            except Exception:
                pass

