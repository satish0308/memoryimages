import os
import shutil
import socket
import http.client
import json
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import secrets
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_

from app.database import get_db
from app.models.user import User, InviteToken
from app.models.media import Media
from app.models.album import Album
from app.models.person import Person, FaceDetection
from app.api.auth import get_current_user
from app.services.task_queue import TaskQueue

logger = logging.getLogger("memorypics.admin")

router = APIRouter()

class DockerUnixSocketClient:
    SOCKET_PATH = "/var/run/docker.sock"

    @classmethod
    def _request(cls, method: str, path: str) -> Optional[Dict[str, Any]]:
        if not os.path.exists(cls.SOCKET_PATH):
            return None
        try:
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            s.settimeout(4.0)
            s.connect(cls.SOCKET_PATH)

            class UnixConn(http.client.HTTPConnection):
                def __init__(self):
                    super().__init__("localhost")
                def connect(self):
                    self.sock = s

            conn = UnixConn()
            conn.connect()
            conn.request(method, path, headers={"Host": "localhost"})
            res = conn.getresponse()
            raw = res.read().decode("utf-8")
            conn.close()
            if raw:
                try:
                    return json.loads(raw)
                except Exception:
                    return {"raw": raw, "status_code": res.status}
            return {"status_code": res.status}
        except Exception as e:
            logger.warning(f"Docker socket error {method} {path}: {e}")
            return None

    @classmethod
    def get_container_info(cls, container_name: str) -> Dict[str, Any]:
        info = cls._request("GET", f"/containers/{container_name}/json")
        if not info or not isinstance(info, dict) or "State" not in info:
            return {"status": "stopped", "running": False, "exists": bool(info)}
        state = info.get("State", {})
        return {
            "status": "running" if state.get("Running") else "stopped",
            "running": bool(state.get("Running")),
            "started_at": state.get("StartedAt"),
            "exists": True
        }

    @classmethod
    def start_container(cls, container_name: str) -> bool:
        res = cls._request("POST", f"/containers/{container_name}/start")
        return bool(res and res.get("status_code") in (204, 304, 200))

    @classmethod
    def stop_container(cls, container_name: str) -> bool:
        res = cls._request("POST", f"/containers/{container_name}/stop")
        return bool(res and res.get("status_code") in (204, 304, 200))

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Enforces that the authenticated user has administrative privileges."""
    if not current_user.is_admin and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user

class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    storage_quota_bytes: Optional[int] = None
    is_active: Optional[bool] = None

class CreateInviteRequest(BaseModel):
    role: Optional[str] = "member"
    quota_bytes: Optional[int] = 0  # 0 = unlimited
    expires_in_days: Optional[int] = 7

@router.get("/users")
def list_users(
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Lists all registered users along with their live storage consumption and quotas."""
    users = db.query(User).order_by(User.id.asc()).all()
    results = []

    for u in users:
        # Fast SQL aggregation for photo count and total bytes used
        stats = db.query(
            func.count(Media.id).label("photo_count"),
            func.coalesce(func.sum(Media.file_size), 0).label("total_bytes")
        ).filter(
            Media.user_id == u.id,
            Media.is_deleted == False
        ).first()

        photo_count = stats.photo_count if stats else 0
        total_bytes = int(stats.total_bytes) if stats else 0

        quota = u.storage_quota_bytes or 0
        usage_pct = round((total_bytes / quota) * 100, 1) if quota > 0 else 0.0

        results.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "is_active": u.is_active,
            "is_admin": u.is_admin,
            "role": u.role or ("admin" if u.is_admin else "member"),
            "storage_quota_bytes": quota,
            "used_storage_bytes": total_bytes,
            "used_storage_mb": round(total_bytes / (1024 * 1024), 2),
            "usage_percent": usage_pct,
            "photo_count": photo_count,
            "created_at": u.created_at.isoformat() if u.created_at else None
        })

    return results

@router.patch("/users/{user_id}")
def update_user_properties(
    user_id: int,
    req: UpdateUserRequest,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Updates user role, storage quota, or account active state."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from deactivating or demoting themselves
    if target_user.id == admin_user.id:
        if req.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own admin account")
        if req.role and req.role != "admin":
            raise HTTPException(status_code=400, detail="Cannot demote your own admin account")

    if req.role is not None:
        if req.role not in ["admin", "member", "viewer"]:
            raise HTTPException(status_code=400, detail="Invalid role. Must be 'admin', 'member', or 'viewer'")
        target_user.role = req.role
        target_user.is_admin = (req.role == "admin")

    if req.storage_quota_bytes is not None:
        if req.storage_quota_bytes < 0:
            raise HTTPException(status_code=400, detail="Quota cannot be negative")
        target_user.storage_quota_bytes = req.storage_quota_bytes

    if req.is_active is not None:
        target_user.is_active = req.is_active

    db.commit()
    db.refresh(target_user)

    return {
        "status": "success",
        "id": target_user.id,
        "username": target_user.username,
        "role": target_user.role,
        "storage_quota_bytes": target_user.storage_quota_bytes,
        "is_active": target_user.is_active
    }

@router.post("/invites")
def create_invite_token(
    req: CreateInviteRequest,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Generates a secure invite token for onboarding family members or friends."""
    code = f"invite_{secrets.token_urlsafe(16)}"
    expires_at = datetime.utcnow() + timedelta(days=req.expires_in_days) if req.expires_in_days else None

    token = InviteToken(
        code=code,
        role=req.role or "member",
        quota_bytes=req.quota_bytes or 0,
        created_by_user_id=admin_user.id,
        expires_at=expires_at
    )
    db.add(token)
    db.commit()
    db.refresh(token)

    return {
        "id": token.id,
        "code": token.code,
        "invite_url": f"/register?invite={token.code}",
        "role": token.role,
        "quota_bytes": token.quota_bytes,
        "expires_at": token.expires_at.isoformat() if token.expires_at else None,
        "created_at": token.created_at.isoformat() if token.created_at else None
    }

@router.get("/invites")
def list_invite_tokens(
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Lists all active and historical invite links."""
    tokens = db.query(InviteToken).order_by(desc(InviteToken.created_at)).all()
    return [{
        "id": t.id,
        "code": t.code,
        "invite_url": f"/register?invite={t.code}",
        "role": t.role,
        "quota_bytes": t.quota_bytes,
        "is_used": t.is_used,
        "used_by_user_id": t.used_by_user_id,
        "expires_at": t.expires_at.isoformat() if t.expires_at else None,
        "is_expired": bool(t.expires_at and t.expires_at < datetime.utcnow()),
        "created_at": t.created_at.isoformat() if t.created_at else None
    } for t in tokens]

@router.delete("/invites/{token_id}")
def revoke_invite_token(
    token_id: int,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Revokes an unused invite token."""
    token = db.query(InviteToken).filter(InviteToken.id == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Invite token not found")
    db.delete(token)
    db.commit()
    return {"status": "success", "revoked_id": token_id}

@router.get("/metrics")
def get_system_metrics(
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Returns real-time system, host, database, and background queue metrics."""
    # 1. Database table counts
    media_count = db.query(func.count(Media.id)).scalar() or 0
    active_media_count = db.query(func.count(Media.id)).filter(Media.is_deleted == False).scalar() or 0
    trash_media_count = db.query(func.count(Media.id)).filter(Media.is_deleted == True).scalar() or 0
    users_count = db.query(func.count(User.id)).scalar() or 0
    albums_count = db.query(func.count(Album.id)).scalar() or 0
    people_count = db.query(func.count(Person.id)).scalar() or 0
    faces_count = db.query(func.count(FaceDetection.id)).scalar() or 0

    previews_1080_count = db.query(func.count(Media.id)).filter(
        Media.is_deleted == False,
        Media.thumbnail_1080_path != None
    ).scalar() or 0
    thumbnails_coverage_pct = round((previews_1080_count / active_media_count * 100), 1) if active_media_count > 0 else 100.0

    total_storage_bytes = db.query(func.coalesce(func.sum(Media.file_size), 0)).filter(Media.is_deleted == False).scalar() or 0

    # 2. Host disk & memory metrics (pure standard library)
    disk = shutil.disk_usage("/")
    disk_total_gb = round(disk.total / (1024 ** 3), 2)
    disk_free_gb = round(disk.free / (1024 ** 3), 2)
    disk_used_percent = round((disk.used / disk.total) * 100, 1) if disk.total > 0 else 0.0

    mem_total_gb = 0.0
    mem_used_gb = 0.0
    mem_percent = 0.0
    try:
        if os.path.exists("/proc/meminfo"):
            with open("/proc/meminfo", "r") as f:
                meminfo = {}
                for line in f:
                    parts = line.split(":")
                    if len(parts) == 2:
                        meminfo[parts[0].strip()] = parts[1].strip()
                total_kb = float(meminfo.get("MemTotal", "0 kB").split()[0])
                avail_kb = float(meminfo.get("MemAvailable", meminfo.get("MemFree", "0 kB")).split()[0])
                used_kb = max(0.0, total_kb - avail_kb)
                mem_total_gb = round(total_kb / (1024 * 1024), 2)
                mem_used_gb = round(used_kb / (1024 * 1024), 2)
                mem_percent = round((used_kb / total_kb) * 100, 1) if total_kb > 0 else 0.0
    except Exception:
        pass

    cpu_cores = os.cpu_count() or 1
    cpu_percent = 0.0
    try:
        load1, _, _ = os.getloadavg()
        cpu_percent = round(min(100.0, (load1 / cpu_cores) * 100), 1)
    except Exception:
        pass

    # 3. Redis Task Queue Status
    pending_tasks = 0
    try:
        from app.services.task_queue import get_task_queue
        q = get_task_queue()
        if hasattr(q, "redis_client") and q.redis_client:
            pending_tasks = q.redis_client.llen("task_queue") or 0
    except Exception:
        pass

    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "database": {
            "total_media": media_count,
            "active_media": active_media_count,
            "trash_media": trash_media_count,
            "total_users": users_count,
            "total_albums": albums_count,
            "total_people": people_count,
            "total_faces": faces_count,
            "total_storage_bytes": int(total_storage_bytes),
            "total_storage_gb": round(total_storage_bytes / (1024 ** 3), 2)
        },
        "thumbnails": {
            "total_active": active_media_count,
            "with_1080_count": previews_1080_count,
            "missing_1080_count": max(0, active_media_count - previews_1080_count),
            "coverage_percent": thumbnails_coverage_pct
        },
        "host": {
            "cpu_cores": cpu_cores,
            "cpu_usage_percent": cpu_percent,
            "memory_total_gb": mem_total_gb,
            "memory_used_gb": mem_used_gb,
            "memory_usage_percent": mem_percent,
            "disk_total_gb": disk_total_gb,
            "disk_free_gb": disk_free_gb,
            "disk_used_percent": disk_used_percent
        },
        "worker": {
            "pending_queue_tasks": pending_tasks
        }
    }

@router.post("/trash/purge-expired")
def purge_expired_trash(
    days: int = Query(30, ge=1, le=365, description="Retention window in days"),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Enforces the 30-Day Trash Retention Lifecycle.
    Safely purges items that have been in Trash for more than the specified retention window.
    Original master files are safely unlinked or moved according to Zero Auto-Deletion rules.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    expired = db.query(Media).filter(
        Media.is_deleted == True,
        Media.marked_for_deletion_at != None,
        Media.marked_for_deletion_at <= cutoff
    ).all()

    purged_count = 0
    reclaimed_bytes = 0

    for m in expired:
        reclaimed_bytes += m.file_size or 0
        # Delete local thumbnails cache
        for t_path in [m.thumbnail_256_path, m.thumbnail_1080_path]:
            if t_path and os.path.isfile(t_path):
                try:
                    os.remove(t_path)
                except Exception:
                    pass
        db.delete(m)
        purged_count += 1

    db.commit()

    return {
        "status": "success",
        "purged_count": purged_count,
        "reclaimed_bytes": reclaimed_bytes,
        "reclaimed_mb": round(reclaimed_bytes / (1024 * 1024), 2),
        "retention_days": days
    }

def generate_prometheus_metrics() -> str:
    """Generates standard Prometheus text exposition format metrics for Grafana/Prometheus scraping."""
    from app.database import SessionLocal
    with SessionLocal() as db:
        media_active = db.query(func.count(Media.id)).filter(Media.is_deleted == False).scalar() or 0
        media_trash = db.query(func.count(Media.id)).filter(Media.is_deleted == True).scalar() or 0
        total_storage_bytes = db.query(func.coalesce(func.sum(Media.file_size), 0)).filter(Media.is_deleted == False).scalar() or 0
        faces_count = db.query(func.count(FaceDetection.id)).scalar() or 0
        people_count = db.query(func.count(Person.id)).scalar() or 0
        users_count = db.query(func.count(User.id)).scalar() or 0
        albums_count = db.query(func.count(Album.id)).scalar() or 0

    disk = shutil.disk_usage("/")
    cpu_cores = os.cpu_count() or 1
    cpu_percent = 0.0
    try:
        load1, _, _ = os.getloadavg()
        cpu_percent = round(min(100.0, (load1 / cpu_cores) * 100), 1)
    except Exception:
        pass

    mem_total = 0
    mem_used = 0
    try:
        if os.path.exists("/proc/meminfo"):
            with open("/proc/meminfo", "r") as f:
                meminfo = {}
                for line in f:
                    parts = line.split(":")
                    if len(parts) == 2:
                        meminfo[parts[0].strip()] = parts[1].strip()
                t_kb = float(meminfo.get("MemTotal", "0 kB").split()[0])
                a_kb = float(meminfo.get("MemAvailable", meminfo.get("MemFree", "0 kB")).split()[0])
                mem_total = int(t_kb * 1024)
                mem_used = int(max(0.0, t_kb - a_kb) * 1024)
    except Exception:
        pass

    pending_tasks = 0
    try:
        from app.services.task_queue import get_task_queue
        q = get_task_queue()
        if hasattr(q, "redis_client") and q.redis_client:
            pending_tasks = q.redis_client.llen("task_queue") or 0
    except Exception:
        pass

    lines = [
        "# HELP memorypics_media_total Total number of indexed media items",
        "# TYPE memorypics_media_total gauge",
        f'memorypics_media_total{{status="active"}} {media_active}',
        f'memorypics_media_total{{status="trash"}} {media_trash}',
        "# HELP memorypics_storage_bytes Total storage consumed by active media",
        "# TYPE memorypics_storage_bytes gauge",
        f'memorypics_storage_bytes {total_storage_bytes}',
        "# HELP memorypics_storage_megabytes Total storage consumed by active media in megabytes",
        "# TYPE memorypics_storage_megabytes gauge",
        f'memorypics_storage_megabytes {round(total_storage_bytes / (1024 * 1024), 2)}',
        "# HELP memorypics_storage_gigabytes Total storage consumed by active media in gigabytes",
        "# TYPE memorypics_storage_gigabytes gauge",
        f'memorypics_storage_gigabytes {round(total_storage_bytes / (1024 * 1024 * 1024), 2)}',
        "# HELP memorypics_faces_total Total number of detected faces",
        "# TYPE memorypics_faces_total gauge",
        f'memorypics_faces_total {faces_count}',
        "# HELP memorypics_people_total Total number of named people",
        "# TYPE memorypics_people_total gauge",
        f'memorypics_people_total {people_count}',
        "# HELP memorypics_users_total Total number of users",
        "# TYPE memorypics_users_total gauge",
        f'memorypics_users_total {users_count}',
        "# HELP memorypics_albums_total Total number of albums",
        "# TYPE memorypics_albums_total gauge",
        f'memorypics_albums_total {albums_count}',
        "# HELP memorypics_queue_pending_tasks Number of background jobs waiting in Redis queue",
        "# TYPE memorypics_queue_pending_tasks gauge",
        f'memorypics_queue_pending_tasks {pending_tasks}',
        "# HELP memorypics_host_cpu_percent Host CPU usage percentage",
        "# TYPE memorypics_host_cpu_percent gauge",
        f'memorypics_host_cpu_percent {cpu_percent}',
        "# HELP memorypics_host_memory_bytes Host memory in bytes",
        "# TYPE memorypics_host_memory_bytes gauge",
        f'memorypics_host_memory_bytes{{type="total"}} {mem_total}',
        f'memorypics_host_memory_bytes{{type="used"}} {mem_used}',
        "# HELP memorypics_host_memory_gigabytes Host memory in gigabytes",
        "# TYPE memorypics_host_memory_gigabytes gauge",
        f'memorypics_host_memory_gigabytes{{type="total"}} {round(mem_total / (1024 * 1024 * 1024), 2)}',
        f'memorypics_host_memory_gigabytes{{type="used"}} {round(mem_used / (1024 * 1024 * 1024), 2)}',
        "# HELP memorypics_host_disk_bytes Host root mount capacity in bytes",
        "# TYPE memorypics_host_disk_bytes gauge",
        f'memorypics_host_disk_bytes{{type="total"}} {disk.total}',
        f'memorypics_host_disk_bytes{{type="free"}} {disk.free}',
        "# HELP memorypics_host_disk_gigabytes Host root mount capacity in gigabytes",
        "# TYPE memorypics_host_disk_gigabytes gauge",
        f'memorypics_host_disk_gigabytes{{type="total"}} {round(disk.total / (1024 * 1024 * 1024), 2)}',
        f'memorypics_host_disk_gigabytes{{type="free"}} {round(disk.free / (1024 * 1024 * 1024), 2)}',
    ]
    return "\n".join(lines) + "\n"

@router.get("/monitoring/services")
def get_monitoring_services(admin_user: User = Depends(require_admin)):
    """Returns the live Docker container run status of Prometheus and Grafana."""
    prom = DockerUnixSocketClient.get_container_info("memorypics-prometheus")
    graf = DockerUnixSocketClient.get_container_info("memorypics-grafana")
    return {
        "prometheus": {
            "name": "memorypics-prometheus",
            "service": "prometheus",
            "status": prom["status"],
            "running": prom["running"],
            "port": 9090,
        },
        "grafana": {
            "name": "memorypics-grafana",
            "service": "grafana",
            "status": graf["status"],
            "running": graf["running"],
            "port": 3001,
        }
    }

@router.post("/monitoring/services/{service_name}/{action}")
def control_monitoring_service(
    service_name: str,
    action: str,
    admin_user: User = Depends(require_admin)
):
    """Starts or stops the Prometheus or Grafana container on demand to save memory."""
    if service_name not in ("prometheus", "grafana"):
        raise HTTPException(status_code=400, detail="Invalid service. Must be 'prometheus' or 'grafana'.")
    if action not in ("start", "stop"):
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'start' or 'stop'.")

    container_name = f"memorypics-{service_name}"
    if action == "start":
        ok = DockerUnixSocketClient.start_container(container_name)
    else:
        ok = DockerUnixSocketClient.stop_container(container_name)

    info = DockerUnixSocketClient.get_container_info(container_name)
    return {
        "service": service_name,
        "action": action,
        "success": ok,
        "status": info["status"],
        "running": info["running"]
    }

@router.post("/maintenance/reindex-vectors")
def reindex_vector_embeddings(
    admin_user: User = Depends(require_admin)
):
    """
    Enqueues background HNSW pgvector index maintenance and VACUUM ANALYZE.
    Keeps semantic search, face clustering, and keyframe lookup sub-5ms across high-volume libraries.
    """
    task = TaskQueue.enqueue(
        "pgvector_reindex_maintenance",
        name="HNSW pgvector Index Maintenance",
        payload={"triggered_by": admin_user.username}
    )
    return {
        "status": "queued",
        "task_id": task["id"],
        "message": "Vector index maintenance task enqueued successfully."
    }

@router.post("/maintenance/pregenerate-1080p")
def pregenerate_1080p_renditions_all(
    admin_user: User = Depends(require_admin)
):
    """
    Enqueues a background worker task to pre-generate missing 1080p WebP renditions
    across the entire library.
    """
    task = TaskQueue.enqueue(
        task_type="pregenerate_1080p_renditions",
        payload={"triggered_by": admin_user.username, "user_id": None},
        name="System-wide 1080p HD Rendition Pre-generation"
    )
    return {
        "status": "queued",
        "task_id": task["id"],
        "message": "System-wide 1080p HD preview pre-generation enqueued successfully."
    }

