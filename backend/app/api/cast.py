import asyncio
import json
import logging
import random
import secrets
import time
from datetime import datetime
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.media import Media
from app.services.task_queue import get_async_redis_client, get_redis_client

logger = logging.getLogger("memorypics.cast_api")

router = APIRouter()

CAST_SESSION_TTL = 120  # 2 minutes TTL, refreshed by 15s heartbeats
REDIS_SESSION_PREFIX = "memorypics:cast:session:"
REDIS_PIN_PREFIX = "memorypics:cast:pin:"
REDIS_DEVICE_PREFIX = "memorypics:cast:device:"
REDIS_ACTIVE_SESSIONS_SET = "memorypics:cast:active_sessions"
REDIS_ACTIVE_SESSIONS_ZSET = "memorypics:cast:active_sessions_zset"
REDIS_CAST_CHANNEL_PREFIX = "memorypics:events:cast:"

# In-memory fallback storage
_in_memory_sessions: Dict[str, Dict[str, Any]] = {}
_in_memory_pins: Dict[str, str] = {}
_in_memory_devices: Dict[str, str] = {}
_in_memory_active_ws: Dict[str, List[WebSocket]] = {}


def _cleanup_in_memory():
    now = time.time()
    expired_ids = [
        sid for sid, data in _in_memory_sessions.items()
        if now - data.get("last_heartbeat_ts", 0) > CAST_SESSION_TTL
    ]
    for sid in expired_ids:
        pin = _in_memory_sessions[sid].get("pin")
        dev = _in_memory_sessions[sid].get("device_id")
        if pin and pin in _in_memory_pins:
            del _in_memory_pins[pin]
        if dev and dev in _in_memory_devices:
            del _in_memory_devices[dev]
        del _in_memory_sessions[sid]


def _format_media_for_cast(item: Media) -> Dict[str, Any]:
    has_faces = False
    face_count = 0
    face_names = []
    try:
        if item.faces:
            has_faces = True
            face_count = len(item.faces)
            for f in item.faces:
                if f.person and f.person.name and not f.person.name.startswith("Unnamed"):
                    if f.person.name not in face_names:
                        face_names.append(f.person.name)
    except Exception:
        pass

    return {
        "id": item.id,
        "filename": item.filename,
        "category": item.category.value if hasattr(item.category, "value") else str(item.category),
        "captured_at": item.captured_at.isoformat() if item.captured_at else None,
        "width": item.width or 0,
        "height": item.height or 0,
        "is_favorite": bool(item.is_favorite),
        "is_blurry": bool(item.is_blurry),
        "has_faces": has_faces,
        "face_count": face_count,
        "face_names": face_names,
        "file_size": item.file_size,
        "camera_make": item.camera_make,
        "camera_model": item.camera_model,
        "iso": item.iso,
        "focal_length": item.focal_length,
        "exposure_time": item.exposure_time,
        "latitude": item.latitude,
        "longitude": item.longitude,
        "location_name": item.location_name,
        "thumbnail_url": f"/api/v1/media/{item.id}/thumbnail?size=256",
        "thumbnail_1080_url": f"/api/v1/media/{item.id}/thumbnail?size=1080",
        "view_url": f"/api/v1/media/{item.id}/view",
        "mood": item.mood,
        "mood_score": item.mood_score,
        "is_smiling": item.is_smiling,
        "dominant_color": item.dominant_color,
        "color_hex": item.color_hex,
        "is_video": (item.mime_type or "").startswith("video/"),
        "duration_seconds": item.duration_seconds,
        "has_motion_photo": bool(getattr(item, "has_motion_photo", False)),
        "motion_video_url": f"/api/v1/media/{item.id}/motion-video" if getattr(item, "has_motion_photo", False) else None,
    }


def _generate_unique_pin(r=None) -> str:
    """Generates an unambiguous 4-digit PIN not in use."""
    for _ in range(50):
        pin = f"{random.randint(1000, 9999)}"
        if r:
            if not r.exists(f"{REDIS_PIN_PREFIX}{pin}"):
                return pin
        else:
            if pin not in _in_memory_pins:
                return pin
    return f"{random.randint(1000, 9999)}"


async def _save_session(session: Dict[str, Any]):
    """Persists session in Redis or memory, registers device & PIN, and updates ZSET for automatic pruning."""
    session_id = session["session_id"]
    pin = session.get("pin")
    device_id = session.get("device_id")
    now = time.time()
    expire_at = now + CAST_SESSION_TTL
    session["last_heartbeat_ts"] = now
    session["last_heartbeat"] = datetime.utcnow().isoformat()
    session["expires_in"] = CAST_SESSION_TTL

    r = await get_async_redis_client()
    if r:
        try:
            payload = json.dumps(session, default=str)
            await r.set(f"{REDIS_SESSION_PREFIX}{session_id}", payload, ex=CAST_SESSION_TTL)
            if pin:
                await r.set(f"{REDIS_PIN_PREFIX}{pin}", session_id, ex=CAST_SESSION_TTL)
            if device_id:
                await r.set(f"{REDIS_DEVICE_PREFIX}{device_id}", session_id, ex=CAST_SESSION_TTL)
            # Add to Sorted Set scored by expiration timestamp
            await r.zadd(REDIS_ACTIVE_SESSIONS_ZSET, {session_id: expire_at})
            # Also keep legacy set for backwards compatibility
            await r.sadd(REDIS_ACTIVE_SESSIONS_SET, session_id)
            # Atomically prune any expired sessions from ZSET
            await r.zremrangebyscore(REDIS_ACTIVE_SESSIONS_ZSET, 0, now)
            await r.close()
            return
        except Exception as e:
            logger.warning(f"Failed to persist session to Redis: {e}")

    # Fallback to in-memory
    _in_memory_sessions[session_id] = session
    if pin:
        _in_memory_pins[pin] = session_id
    if device_id:
        _in_memory_devices[device_id] = session_id
    _cleanup_in_memory()


async def _get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves session from Redis or in-memory fallback."""
    r = await get_async_redis_client()
    if r:
        try:
            raw = await r.get(f"{REDIS_SESSION_PREFIX}{session_id}")
            await r.close()
            if raw:
                return json.loads(raw)
        except Exception as e:
            logger.warning(f"Failed to get session from Redis: {e}")

    _cleanup_in_memory()
    return _in_memory_sessions.get(session_id)


async def _broadcast_cast_event(session_id: str, event_data: Dict[str, Any]):
    """Broadcasts event via Redis pubsub and in-memory WebSocket connections."""
    channel = f"{REDIS_CAST_CHANNEL_PREFIX}{session_id}"
    payload = json.dumps(event_data, default=str)

    # 1. Publish to Redis channel for multi-instance / worker sync
    r = await get_async_redis_client()
    if r:
        try:
            await r.publish(channel, payload)
            await r.close()
        except Exception as e:
            logger.warning(f"Failed to publish to Redis cast channel: {e}")

    # 2. In-memory direct broadcast to active WebSockets in this process
    active_ws = _in_memory_active_ws.get(session_id, [])
    dead_sockets = []
    for ws in list(active_ws):
        try:
            await ws.send_text(payload)
        except Exception:
            dead_sockets.append(ws)
    for ws in dead_sockets:
        if ws in active_ws:
            active_ws.remove(ws)


class CreateSessionRequest(BaseModel):
    tv_name: Optional[str] = "Smart TV"
    device_id: Optional[str] = None


class PairSessionRequest(BaseModel):
    pin: str
    controller_name: Optional[str] = "Mobile Remote"


class CastCommandRequest(BaseModel):
    command: str  # cast_media, cast_playlist, next, prev, play, pause, set_interval, toggle_motion, disconnect, video_seek, video_volume, video_sync, laser_pointer, set_privacy_shield
    media_id: Optional[int] = None
    media_ids: Optional[List[int]] = None
    interval_sec: Optional[int] = None
    ken_burns: Optional[bool] = None
    # Video remote controls
    time_sec: Optional[float] = None
    volume: Optional[float] = None
    is_muted: Optional[bool] = None
    is_paused: Optional[bool] = None
    duration_sec: Optional[float] = None
    # Virtual laser pointer & trackpad
    laser_x: Optional[float] = None  # 0.0 - 1.0 normalized
    laser_y: Optional[float] = None  # 0.0 - 1.0 normalized
    laser_active: Optional[bool] = None
    # Privacy shield
    privacy_shield: Optional[bool] = None


@router.post("/session/create")
async def create_cast_session(req: CreateSessionRequest):
    """
    Creates or resumes a Cast session for a TV / display receiver.
    If device_id is provided and an existing active session exists, resumes it
    with the same PIN to prevent duplicate sessions on page reload.
    """
    # 1. Check for existing session by persistent device_id to avoid duplicate sessions on reload
    if req.device_id:
        existing_sid = None
        r = await get_async_redis_client()
        if r:
            try:
                existing_sid = await r.get(f"{REDIS_DEVICE_PREFIX}{req.device_id}")
                await r.close()
            except Exception:
                pass
        if not existing_sid:
            existing_sid = _in_memory_devices.get(req.device_id)

        if existing_sid:
            existing_session = await _get_session(existing_sid)
            if existing_session and existing_session.get("status") != "closed":
                if req.tv_name:
                    existing_session["tv_name"] = req.tv_name
                await _save_session(existing_session)
                logger.info(f"Resumed existing Cast session {existing_sid} for device {req.device_id} (PIN {existing_session.get('pin')})")
                return existing_session

    session_id = f"tv_{secrets.token_hex(6)}"
    sync_r = get_redis_client()
    pin = _generate_unique_pin(sync_r)
    if sync_r:
        try:
            sync_r.close()
        except Exception:
            pass

    session_data = {
        "session_id": session_id,
        "device_id": req.device_id,
        "pin": pin,
        "tv_name": req.tv_name or "Smart TV Lounge",
        "created_at": datetime.utcnow().isoformat(),
        "last_heartbeat_ts": time.time(),
        "status": "waiting",  # "waiting" | "connected" | "idle"
        "controller_name": None,
        "current_media": None,
        "privacy_shield": False,
        "video_state": {
            "current_time": 0,
            "duration_sec": 0,
            "volume": 1.0,
            "is_muted": False,
            "is_paused": False,
        },
        "slideshow_state": {
            "is_playing": False,
            "interval_sec": 6,
            "ken_burns": True,
            "playlist_ids": [],
            "playlist_index": 0,
            "total_items": 0,
        },
        "expires_in": CAST_SESSION_TTL,
    }

    await _save_session(session_data)
    logger.info(f"Created Cast session {session_id} with PIN {pin} for '{session_data['tv_name']}' (device {req.device_id})")
    return session_data


@router.get("/sessions")
async def list_active_cast_sessions():
    """
    Returns active Cast sessions on the local network for 1-click discovery.
    Utilizes Redis ZSET with automatic timestamp pruning.
    """
    sessions = []
    now = time.time()
    r = await get_async_redis_client()
    if r:
        try:
            # Atomic cleanup of expired sessions from ZSET
            await r.zremrangebyscore(REDIS_ACTIVE_SESSIONS_ZSET, 0, now)
            active_sids = await r.zrange(REDIS_ACTIVE_SESSIONS_ZSET, 0, -1)
            for sid in active_sids:
                raw = await r.get(f"{REDIS_SESSION_PREFIX}{sid}")
                if raw:
                    s = json.loads(raw)
                    sessions.append({
                        "session_id": s["session_id"],
                        "device_id": s.get("device_id"),
                        "tv_name": s.get("tv_name", "Smart TV"),
                        "status": s.get("status", "waiting"),
                        "controller_name": s.get("controller_name"),
                        "has_current_media": bool(s.get("current_media")),
                    })
                else:
                    await r.zrem(REDIS_ACTIVE_SESSIONS_ZSET, sid)
                    await r.srem(REDIS_ACTIVE_SESSIONS_SET, sid)
            await r.close()
            return {"sessions": sessions}
        except Exception as e:
            logger.warning(f"Error listing Redis sessions: {e}")

    _cleanup_in_memory()
    for sid, s in _in_memory_sessions.items():
        sessions.append({
            "session_id": s["session_id"],
            "device_id": s.get("device_id"),
            "tv_name": s.get("tv_name", "Smart TV"),
            "status": s.get("status", "waiting"),
            "controller_name": s.get("controller_name"),
            "has_current_media": bool(s.get("current_media")),
        })
    return {"sessions": sessions}


@router.get("/session/{session_id}")
async def get_cast_session(session_id: str):
    """Gets details and current playback state of a Cast session."""
    session = await _get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Cast session not found or expired")
    return session


@router.post("/session/pair")
async def pair_cast_session(req: PairSessionRequest):
    """
    Pairs a controller (phone/laptop) with a TV display using the 4-digit PIN.
    Transitions session status to 'connected' and broadcasts pairing event to TV.
    """
    clean_pin = req.pin.strip()
    session_id = None

    r = await get_async_redis_client()
    if r:
        try:
            session_id = await r.get(f"{REDIS_PIN_PREFIX}{clean_pin}")
            await r.close()
        except Exception as e:
            logger.warning(f"Error checking PIN in Redis: {e}")

    if not session_id:
        _cleanup_in_memory()
        session_id = _in_memory_pins.get(clean_pin)

    if not session_id:
        raise HTTPException(status_code=404, detail="Invalid or expired pairing PIN. Check the TV screen.")

    session = await _get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Cast session expired or no longer available.")

    session["status"] = "connected"
    session["controller_name"] = req.controller_name or "Mobile Remote"
    await _save_session(session)

    # Broadcast paired event to TV receiver
    event_payload = {
        "event": "paired",
        "session_id": session_id,
        "controller_name": session["controller_name"],
        "session": session,
    }
    await _broadcast_cast_event(session_id, event_payload)
    logger.info(f"Paired controller '{session['controller_name']}' to TV session {session_id}")

    return {"success": True, "session_id": session_id, "session": session}


@router.post("/session/{session_id}/heartbeat")
async def heartbeat_cast_session(session_id: str):
    """Refreshes the session TTL to keep display alive."""
    session = await _get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Cast session not found")
    await _save_session(session)
    return {"status": "ok", "session_id": session_id}


@router.post("/session/{session_id}/command")
async def handle_cast_command(session_id: str, req: CastCommandRequest, db: Session = Depends(get_db)):
    """
    Sends playback/media commands from remote controller to TV receiver:
    - cast_media: Display single photo/video on TV
    - cast_playlist: Start slideshow with given media IDs
    - next / prev: Navigate playlist
    - play / pause: Control slideshow playback
    - set_interval: Change slide duration (seconds)
    - toggle_motion: Turn Ken Burns pan/zoom on/off
    - disconnect: Unpair and return TV to standby
    """
    session = await _get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Cast session not found")

    cmd = req.command.lower()
    event_payload: Dict[str, Any] = {"event": "command", "command": cmd}

    if cmd == "cast_media":
        if not req.media_id:
            raise HTTPException(status_code=400, detail="media_id required for cast_media")
        item = db.query(Media).filter(Media.id == req.media_id, Media.is_deleted == False).first()
        if not item:
            raise HTTPException(status_code=404, detail="Media item not found")

        formatted = _format_media_for_cast(item)
        session["current_media"] = formatted
        session["slideshow_state"]["is_playing"] = False
        event_payload = {
            "event": "media_change",
            "media": formatted,
            "session": session,
        }

    elif cmd == "cast_playlist":
        media_ids = req.media_ids or []
        if not media_ids and req.media_id:
            media_ids = [req.media_id]
        if not media_ids:
            raise HTTPException(status_code=400, detail="media_ids required for cast_playlist")

        session["slideshow_state"]["playlist_ids"] = media_ids
        session["slideshow_state"]["playlist_index"] = 0
        session["slideshow_state"]["total_items"] = len(media_ids)
        session["slideshow_state"]["is_playing"] = True
        if req.interval_sec:
            session["slideshow_state"]["interval_sec"] = req.interval_sec
        if req.ken_burns is not None:
            session["slideshow_state"]["ken_burns"] = req.ken_burns

        # Load first item
        first_id = media_ids[0]
        first_item = db.query(Media).filter(Media.id == first_id, Media.is_deleted == False).first()
        if first_item:
            session["current_media"] = _format_media_for_cast(first_item)

        event_payload = {
            "event": "playlist_start",
            "media": session["current_media"],
            "slideshow_state": session["slideshow_state"],
            "session": session,
        }

    elif cmd in ("next", "prev"):
        state = session.get("slideshow_state", {})
        playlist_ids = state.get("playlist_ids", [])
        if playlist_ids:
            cur_idx = state.get("playlist_index", 0)
            if cmd == "next":
                new_idx = (cur_idx + 1) % len(playlist_ids)
            else:
                new_idx = (cur_idx - 1 + len(playlist_ids)) % len(playlist_ids)
            state["playlist_index"] = new_idx
            next_id = playlist_ids[new_idx]
            next_item = db.query(Media).filter(Media.id == next_id, Media.is_deleted == False).first()
            if next_item:
                session["current_media"] = _format_media_for_cast(next_item)
            event_payload = {
                "event": "media_change",
                "direction": cmd,
                "media": session["current_media"],
                "slideshow_state": state,
                "session": session,
            }
        else:
            event_payload = {"event": "noop", "message": "No playlist active"}

    elif cmd == "play":
        session["slideshow_state"]["is_playing"] = True
        event_payload = {"event": "slideshow_play", "slideshow_state": session["slideshow_state"]}

    elif cmd == "pause":
        session["slideshow_state"]["is_playing"] = False
        event_payload = {"event": "slideshow_pause", "slideshow_state": session["slideshow_state"]}

    elif cmd == "set_interval":
        if req.interval_sec and 2 <= req.interval_sec <= 60:
            session["slideshow_state"]["interval_sec"] = req.interval_sec
            event_payload = {"event": "interval_change", "interval_sec": req.interval_sec}

    elif cmd == "toggle_motion":
        cur_val = session["slideshow_state"].get("ken_burns", True)
        new_val = not cur_val if req.ken_burns is None else req.ken_burns
        session["slideshow_state"]["ken_burns"] = new_val
        event_payload = {"event": "motion_change", "ken_burns": new_val}

    elif cmd == "disconnect":
        session["status"] = "waiting"
        session["controller_name"] = None
        session["current_media"] = None
        session["slideshow_state"]["is_playing"] = False
        event_payload = {"event": "disconnected", "session": session}

    elif cmd == "video_seek":
        if req.time_sec is not None:
            if "video_state" not in session:
                session["video_state"] = {}
            session["video_state"]["current_time"] = req.time_sec
            event_payload = {
                "event": "video_seek",
                "time_sec": req.time_sec,
                "session": session,
            }

    elif cmd == "video_volume":
        if "video_state" not in session:
            session["video_state"] = {}
        if req.volume is not None:
            session["video_state"]["volume"] = max(0.0, min(1.0, req.volume))
        if req.is_muted is not None:
            session["video_state"]["is_muted"] = req.is_muted
        event_payload = {
            "event": "video_volume",
            "volume": session["video_state"].get("volume", 1.0),
            "is_muted": session["video_state"].get("is_muted", False),
            "session": session,
        }

    elif cmd == "video_sync":
        if "video_state" not in session:
            session["video_state"] = {}
        if req.time_sec is not None:
            session["video_state"]["current_time"] = req.time_sec
        if req.duration_sec is not None:
            session["video_state"]["duration_sec"] = req.duration_sec
        if req.is_paused is not None:
            session["video_state"]["is_paused"] = req.is_paused
        event_payload = {
            "event": "video_sync",
            "video_state": session["video_state"],
            "session": session,
        }

    elif cmd == "laser_pointer":
        event_payload = {
            "event": "laser_pointer",
            "laser_x": req.laser_x,
            "laser_y": req.laser_y,
            "laser_active": bool(req.laser_active),
        }

    elif cmd == "set_privacy_shield":
        new_val = bool(req.privacy_shield) if req.privacy_shield is not None else not session.get("privacy_shield", False)
        session["privacy_shield"] = new_val
        event_payload = {
            "event": "privacy_shield_change",
            "privacy_shield": new_val,
            "session": session,
        }

    await _save_session(session)
    await _broadcast_cast_event(session_id, event_payload)
    return {"status": "ok", "command": cmd, "session": session}


@router.post("/session/{session_id}/close")
async def close_cast_session(session_id: str):
    """
    Explicitly closes a Cast session on TV browser window unload/close.
    Provides immediate 0-second cleanup to prevent ghost sessions on the network.
    """
    session = await _get_session(session_id)
    if session:
        pin = session.get("pin")
        dev = session.get("device_id")
        r = await get_async_redis_client()
        if r:
            try:
                await r.delete(f"{REDIS_SESSION_PREFIX}{session_id}")
                if pin:
                    await r.delete(f"{REDIS_PIN_PREFIX}{pin}")
                if dev:
                    await r.delete(f"{REDIS_DEVICE_PREFIX}{dev}")
                await r.zrem(REDIS_ACTIVE_SESSIONS_ZSET, session_id)
                await r.srem(REDIS_ACTIVE_SESSIONS_SET, session_id)
                await r.close()
            except Exception:
                pass
        if session_id in _in_memory_sessions:
            del _in_memory_sessions[session_id]
        if pin and pin in _in_memory_pins:
            del _in_memory_pins[pin]
        if dev and dev in _in_memory_devices:
            del _in_memory_devices[dev]

        await _broadcast_cast_event(session_id, {"event": "tv_closed", "session_id": session_id})
        logger.info(f"Explicitly closed Cast session {session_id}")
    return {"status": "closed", "session_id": session_id}


@router.get("/ambient-media")
async def get_ambient_media(limit: int = 30, db: Session = Depends(get_db)):
    """
    Returns curated ambient media (favorites, scenic photos, high-resolution memories)
    for Smart TV Lounge standby screensaver mode.
    """
    items = (
        db.query(Media)
        .filter(Media.is_deleted == False, Media.is_blurry == False)
        .order_by(Media.is_favorite.desc(), Media.captured_at.desc())
        .limit(limit)
        .all()
    )
    return {"media": [_format_media_for_cast(m) for m in items]}


@router.websocket("/ws/{session_id}")
async def websocket_cast_endpoint(websocket: WebSocket, session_id: str):
    """
    Real-time bidirectional WebSocket endpoint for Smart TV Lounge receiver
    and connected remote controllers. Streams media changes, slideshow ticks,
    and remote commands with ultra-low latency (<50ms).
    """
    await websocket.accept()
    logger.info(f"Cast WebSocket client connected to session {session_id}")

    # Track in-memory connection
    if session_id not in _in_memory_active_ws:
        _in_memory_active_ws[session_id] = []
    _in_memory_active_ws[session_id].append(websocket)

    # Send initial session snapshot
    session = await _get_session(session_id)
    if session:
        try:
            await websocket.send_text(json.dumps({
                "event": "init",
                "session": session,
            }, default=str))
        except Exception as e:
            logger.warning(f"Error sending cast ws init payload: {e}")

    # Setup Redis PubSub subscription
    channel = f"{REDIS_CAST_CHANNEL_PREFIX}{session_id}"
    r = await get_async_redis_client()
    pubsub = None
    if r:
        try:
            pubsub = r.pubsub()
            await pubsub.subscribe(channel)
            logger.info(f"Cast WS subscribed to Redis channel {channel}")
        except Exception as e:
            logger.warning(f"Failed to subscribe to Redis cast channel: {e}")
            pubsub = None

    async def client_receiver():
        while True:
            msg = await websocket.receive_text()
            try:
                parsed = json.loads(msg)
                action = parsed.get("action")
                if action == "ping":
                    # Heartbeat refresh
                    s = await _get_session(session_id)
                    if s:
                        await _save_session(s)
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
            # Polling fallback if Redis is unavailable
            last_check = 0
            while True:
                await asyncio.sleep(1.5)
                s = await _get_session(session_id)
                if s and s.get("last_heartbeat_ts", 0) > last_check:
                    last_check = s.get("last_heartbeat_ts", 0)
                    await websocket.send_text(json.dumps({
                        "event": "sync",
                        "session": s,
                    }, default=str))

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
        logger.info(f"Cast WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.warning(f"Cast WebSocket connection error: {e}")
    finally:
        recv_task.cancel()
        send_task.cancel()
        if session_id in _in_memory_active_ws and websocket in _in_memory_active_ws[session_id]:
            _in_memory_active_ws[session_id].remove(websocket)
            if len(_in_memory_active_ws[session_id]) == 0:
                del _in_memory_active_ws[session_id]
                # Broadcast socket offline event
                await _broadcast_cast_event(session_id, {"event": "tv_socket_offline", "session_id": session_id})
        if pubsub and r:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
                await r.close()
            except Exception:
                pass
