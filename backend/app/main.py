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

@app.on_event("startup")
def on_startup():
    """Initializes SQLite/PostgreSQL schema upon container startup and launches background directory watcher."""
    Base.metadata.create_all(bind=engine)
    try:
        start_watcher()
    except Exception as e:
        print(f"Directory watcher startup warning: {e}")

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
