import os
import logging
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, BackgroundTasks

from app.config import settings
from app.services.database_service import (
    get_database_status,
    ensure_pgvector_hnsw_index,
    migrate_database
)
from app.database import check_postgres_availability

router = APIRouter()
logger = logging.getLogger(__name__)

class TestConnectionRequest(BaseModel):
    url: Optional[str] = None

class MigrateRequest(BaseModel):
    source_url: Optional[str] = None
    target_url: Optional[str] = None

class SwitchDialectRequest(BaseModel):
    target: str  # "postgresql" or "sqlite"

@router.get("/status")
def get_db_status():
    """Returns telemetry on current database engine, pgvector status, and table counts."""
    return get_database_status()

@router.post("/test-connection")
def test_postgres_connection(req: TestConnectionRequest = TestConnectionRequest()):
    """Tests connection to PostgreSQL and verifies pgvector extension."""
    target_url = req.url or settings.POSTGRES_URL
    res = check_postgres_availability(target_url)
    return res

@router.post("/create-hnsw-index")
def create_hnsw_index():
    """Creates/rebuilds HNSW cosine index on PostgreSQL for sub-10ms CLIP vector queries."""
    from app.database import is_postgres
    if not is_postgres:
        raise HTTPException(
            status_code=400, 
            detail="HNSW vector index can only be created when PostgreSQL is the active database engine."
        )
    res = ensure_pgvector_hnsw_index()
    if res.get("error"):
        raise HTTPException(status_code=500, detail=f"Index creation failed: {res['error']}")
    return {"message": "HNSW vector index created successfully", "details": res}

@router.post("/migrate")
def trigger_database_migration(req: MigrateRequest = MigrateRequest()):
    """
    Executes a zero-downtime data migration between SQLite and PostgreSQL.
    Converts binary embedding buffers into native pgvector vector(512) arrays.
    """
    res = migrate_database(source_url=req.source_url, target_url=req.target_url)
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error", "Migration failed"))
    return res

@router.post("/switch-engine")
def switch_engine_config(req: SwitchDialectRequest):
    """
    Updates the DATABASE_URL in the runtime environment / .env file.
    Returns status and instructions for container reload.
    """
    target = req.target.lower().strip()
    if target not in ["postgresql", "sqlite"]:
        raise HTTPException(status_code=400, detail="Target must be 'postgresql' or 'sqlite'")

    new_url = settings.POSTGRES_URL if target == "postgresql" else "sqlite:////data/db/memorypics.db"

    env_path = "/app/.env"
    if not os.path.exists(env_path):
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")

    updated_file = False
    if os.path.exists(env_path):
        try:
            with open(env_path, "r") as f:
                content = f.read()

            lines = content.splitlines()
            new_lines = []
            found = False
            for line in lines:
                if line.startswith("DATABASE_URL="):
                    new_lines.append(f"DATABASE_URL={new_url}")
                    found = True
                else:
                    new_lines.append(line)
            if not found:
                new_lines.append(f"DATABASE_URL={new_url}")

            with open(env_path, "w") as f:
                f.write("\n".join(new_lines) + "\n")
            updated_file = True
        except Exception as e:
            logger.warning(f"Could not rewrite .env file: {e}")

    return {
        "success": True,
        "new_target": target,
        "new_database_url": new_url.split("@")[-1] if "@" in new_url else new_url,
        "env_file_updated": updated_file,
        "message": f"Database engine configured to {target}. Restart container to take effect."
    }
