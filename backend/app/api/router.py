from fastapi import APIRouter
from app.api import media, triage, people, sync, search, albums, auth, settings, backup, s3_storage, database, tasks, purge, admin

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(admin.router, prefix="/admin", tags=["Admin & Multi-Tenancy"])
api_router.include_router(settings.router, prefix="/settings", tags=["App Settings"])
api_router.include_router(database.router, prefix="/system/database", tags=["Dual-Database & pgvector"])
api_router.include_router(backup.router, prefix="/system/backups", tags=["System Backups & Disaster Recovery"])
api_router.include_router(s3_storage.router, prefix="/storage/s3", tags=["S3 / MinIO Object Storage"])
api_router.include_router(purge.router, prefix="/system/purge", tags=["Host Disk Purge"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["Background Tasks & Worker"])
api_router.include_router(media.router, prefix="/media", tags=["Media"])
api_router.include_router(triage.router, prefix="/triage", tags=["Smart Triage & Cleanup"])
api_router.include_router(people.router, prefix="/people", tags=["People & Faces"])
api_router.include_router(sync.router, prefix="/sync", tags=["Sync & Sources"])
api_router.include_router(search.router, prefix="/search", tags=["Search & Events"])
api_router.include_router(albums.router, prefix="/albums", tags=["Albums & Collections"])

@api_router.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "MyMemoryPics API"}
