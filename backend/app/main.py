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

    try:
        from app.database import SessionLocal
        from app.services.backup_service import check_and_run_scheduled_backup
        with SessionLocal() as db:
            check_and_run_scheduled_backup(db)
    except Exception as e:
        print(f"Backup scheduler warning: {e}")

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
