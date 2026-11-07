from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.config import settings
from app.database import engine, Base
from app.models import media, person, sync, album, user
from app.api.router import api_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="World-class AI-powered autonomous photo management and smart triage platform.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Set CORS origins for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.services.watcher import start_watcher, stop_watcher

def check_and_upgrade_schema(db_engine):
    from sqlalchemy import inspect, text
    try:
        inspector = inspect(db_engine)
        if "media" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("media")]
            with db_engine.connect() as conn:
                if "mood" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN mood VARCHAR(64)"))
                if "mood_score" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN mood_score FLOAT DEFAULT 0.0"))
                if "is_smiling" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN is_smiling BOOLEAN DEFAULT FALSE"))
                if "dominant_color" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN dominant_color VARCHAR(32)"))
                if "color_hex" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN color_hex VARCHAR(7)"))
                if "duration_seconds" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN duration_seconds FLOAT"))
                if "blur_type" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN blur_type VARCHAR(32) DEFAULT 'sharp'"))
                if "is_bokeh" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN is_bokeh BOOLEAN DEFAULT FALSE"))
                if "is_enhanced" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN is_enhanced BOOLEAN DEFAULT FALSE"))
                if "enhancement_data" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN enhancement_data TEXT"))
                if "aesthetic_score" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN aesthetic_score FLOAT DEFAULT 0.0"))
                if "is_best_shot" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN is_best_shot BOOLEAN DEFAULT FALSE"))
                if "edit_recipe" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN edit_recipe TEXT"))
                if "share_token" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN share_token VARCHAR(64)"))
                if "user_id" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN user_id INTEGER"))
                if "is_backed_up_gdrive" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN is_backed_up_gdrive BOOLEAN DEFAULT FALSE"))
                if "gdrive_backup_file_id" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN gdrive_backup_file_id VARCHAR(255)"))
                if "gdrive_backup_folder_id" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN gdrive_backup_folder_id VARCHAR(255)"))
                if "gdrive_backup_folder_name" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN gdrive_backup_folder_name VARCHAR(255)"))
                if "gdrive_backed_up_at" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN gdrive_backed_up_at DATETIME"))
                if "faces_scanned" not in columns:
                    conn.execute(text("ALTER TABLE media ADD COLUMN faces_scanned BOOLEAN DEFAULT FALSE"))
                if "user_id" not in columns:
                    conn.execute(text("UPDATE media SET user_id = 1 WHERE user_id IS NULL"))
                conn.commit()

        if "albums" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("albums")]
            with db_engine.connect() as conn:
                if "user_id" not in columns:
                    conn.execute(text("ALTER TABLE albums ADD COLUMN user_id INTEGER"))
                    conn.execute(text("UPDATE albums SET user_id = 1 WHERE user_id IS NULL"))
                if "is_dynamic" not in columns:
                    conn.execute(text("ALTER TABLE albums ADD COLUMN is_dynamic BOOLEAN DEFAULT FALSE"))
                if "rules" not in columns:
                    conn.execute(text("ALTER TABLE albums ADD COLUMN rules TEXT"))
                if "share_token" not in columns:
                    conn.execute(text("ALTER TABLE albums ADD COLUMN share_token VARCHAR(64)"))
                if "is_public" not in columns:
                    conn.execute(text("ALTER TABLE albums ADD COLUMN is_public BOOLEAN DEFAULT FALSE"))
                if "allow_guest_uploads" not in columns:
                    conn.execute(text("ALTER TABLE albums ADD COLUMN allow_guest_uploads BOOLEAN DEFAULT FALSE"))
                conn.commit()

        if "people" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("people")]
            with db_engine.connect() as conn:
                if "user_id" not in columns:
                    conn.execute(text("ALTER TABLE people ADD COLUMN user_id INTEGER"))
                    conn.execute(text("UPDATE people SET user_id = 1 WHERE user_id IS NULL"))
                if "relationship_type" not in columns:
                    conn.execute(text("ALTER TABLE people ADD COLUMN relationship_type VARCHAR(32)"))
                if "cover_media_id" not in columns:
                    conn.execute(text("ALTER TABLE people ADD COLUMN cover_media_id INTEGER"))
                conn.commit()

        if "sync_sources" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("sync_sources")]
            with db_engine.connect() as conn:
                if "user_id" not in columns:
                    conn.execute(text("ALTER TABLE sync_sources ADD COLUMN user_id INTEGER"))
                    conn.execute(text("UPDATE sync_sources SET user_id = 1 WHERE user_id IS NULL"))
                conn.commit()

        if "face_detections" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("face_detections")]
            with db_engine.connect() as conn:
                if "landmarks_str" not in columns:
                    conn.execute(text("ALTER TABLE face_detections ADD COLUMN landmarks_str VARCHAR(255)"))
                conn.commit()
    except Exception as e:
        print(f"Schema upgrade notice: {e}")

@app.on_event("startup")
def on_startup():
    """Initializes SQLite/PostgreSQL schema upon container startup and launches background directory watcher."""
    Base.metadata.create_all(bind=engine)
    check_and_upgrade_schema(engine)
    try:
        start_watcher()
    except Exception as e:
        print(f"Directory watcher startup warning: {e}")

    # Run scheduled backup checks in non-blocking background daemon thread to ensure instant container startup
    import threading
    def _bg_backup_check():
        try:
            from app.database import SessionLocal
            from app.services.backup_service import check_and_run_scheduled_backup
            with SessionLocal() as db:
                check_and_run_scheduled_backup(db)
        except Exception as e:
            print(f"Backup scheduler warning: {e}")

    threading.Thread(target=_bg_backup_check, daemon=True, name="startup_backup_check").start()

@app.on_event("shutdown")
def on_shutdown():
    """Cleanly stops background watchers."""
    stop_watcher()

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "app": settings.PROJECT_NAME,
        "docs": "/docs",
        "api_v1": settings.API_V1_STR,
        "status": "online"
    }
