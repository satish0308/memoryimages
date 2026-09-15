import os
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "MyMemoryPics"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "memorypics_secret_dev_key_12345")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:////data/db/memorypics.db")
    
    MEDIA_DIR: str = os.getenv("MEDIA_DIR", "/data/originals")
    THUMBNAIL_DIR: str = os.getenv("THUMBNAIL_DIR", "/data/thumbnails")
    
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    
    # Google OAuth
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/sync/google/callback")
    
    # Triage defaults
    SCREENSHOT_DEFAULT_EXPIRY_DAYS: int = 30
    
    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    class Config:
        case_sensitive = True

settings = Settings()
