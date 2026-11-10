import os
import json
import time
import logging
from typing import List, Optional
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

ACTIVE_ENGINE_FILE = "/data/db/active_engine.json"
ENV_FILE_PATHS = [
    "/app/.env",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
]

def find_env_file() -> Optional[str]:
    for p in ENV_FILE_PATHS:
        if os.path.exists(p):
            return p
    return None

def get_persisted_engine() -> Optional[str]:
    """Reads the active engine ('postgresql' or 'sqlite') from persistent storage or checks .env file."""
    env_file = find_env_file()
    
    # Check if .env was manually edited more recently than active_engine.json
    if env_file and os.path.exists(ACTIVE_ENGINE_FILE):
        try:
            env_mtime = os.path.getmtime(env_file)
            json_mtime = os.path.getmtime(ACTIVE_ENGINE_FILE)
            if env_mtime > json_mtime + 2:
                # User edited .env manually
                with open(env_file, "r") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("DATABASE_URL="):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            if val.startswith("postgresql"):
                                set_persisted_engine("postgresql")
                                return "postgresql"
                            elif val.startswith("sqlite"):
                                set_persisted_engine("sqlite")
                                return "sqlite"
        except Exception as e:
            logger.debug(f"Could not compare mtimes: {e}")

    if os.path.exists(ACTIVE_ENGINE_FILE):
        try:
            with open(ACTIVE_ENGINE_FILE, "r") as f:
                data = json.load(f)
                engine = data.get("engine", "").lower().strip()
                if engine in ("postgresql", "sqlite"):
                    return engine
        except Exception as e:
            logger.warning(f"Error reading {ACTIVE_ENGINE_FILE}: {e}")
            
    # Check environment variable
    env_url = os.getenv("DATABASE_URL", "")
    if env_url.startswith("postgresql"):
        return "postgresql"
    elif env_url.startswith("sqlite"):
        return "sqlite"
        
    return None

def set_persisted_engine(engine_name: str) -> bool:
    """Writes the active engine to /data/db/active_engine.json for persistence across container restarts."""
    try:
        os.makedirs(os.path.dirname(ACTIVE_ENGINE_FILE), exist_ok=True)
        with open(ACTIVE_ENGINE_FILE, "w") as f:
            json.dump({
                "engine": engine_name.lower().strip(),
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error writing {ACTIVE_ENGINE_FILE}: {e}")
        return False

def resolve_database_url() -> str:
    postgres_url = os.getenv(
        "POSTGRES_URL",
        "postgresql://memorypics:memorypics_password_123@db:5432/memorypics"
    )
    sqlite_url = "sqlite:////data/db/memorypics.db"

    persisted = get_persisted_engine()
    if persisted == "postgresql":
        return postgres_url
    elif persisted == "sqlite":
        return sqlite_url

    # Check DATABASE_URL environment variable
    env_db = os.getenv("DATABASE_URL")
    if env_db:
        return env_db

    # Default to PostgreSQL
    return postgres_url

class Settings(BaseSettings):
    PROJECT_NAME: str = "MyMemoryPics"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "memorypics_secret_dev_key_12345")
    DATABASE_URL: str = resolve_database_url()
    POSTGRES_URL: str = os.getenv("POSTGRES_URL", "postgresql://memorypics:memorypics_password_123@db:5432/memorypics")
    
    MEDIA_DIR: str = os.getenv("MEDIA_DIR", "/data/originals")
    THUMBNAIL_DIR: str = os.getenv("THUMBNAIL_DIR", "/data/thumbnails")
    
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    
    # Google OAuth
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/sync/google/callback")
    
    # Triage defaults
    SCREENSHOT_DEFAULT_EXPIRY_DAYS: int = 30
    
    # S3 / MinIO Object Storage Engine
    S3_ENDPOINT_URL: str = os.getenv("S3_ENDPOINT_URL", "http://host.docker.internal:9002")
    S3_ACCESS_KEY_ID: str = os.getenv("S3_ACCESS_KEY_ID", "minioadmin")
    S3_SECRET_ACCESS_KEY: str = os.getenv("S3_SECRET_ACCESS_KEY", "minioadmin123")
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "mymemorypics")
    S3_REGION_NAME: str = os.getenv("S3_REGION_NAME", "us-east-1")
    S3_PUBLIC_URL: str = os.getenv("S3_PUBLIC_URL", "http://localhost:9002")
    S3_CONSOLE_URL: str = os.getenv("S3_CONSOLE_URL", "http://localhost:9001")
    
    # Asynchronous Task Queue & Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    
    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    def refresh_database_url(self, new_url: Optional[str] = None) -> str:
        self.DATABASE_URL = new_url or resolve_database_url()
        return self.DATABASE_URL

    class Config:
        case_sensitive = True

settings = Settings()
