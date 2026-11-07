import os
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "MyMemoryPics"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "memorypics_secret_dev_key_12345")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:////data/db/memorypics.db")
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

    class Config:
        case_sensitive = True

settings = Settings()
