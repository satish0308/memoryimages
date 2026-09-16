from fastapi import APIRouter
from app.api import media, triage, people, sync, search, albums, auth

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(media.router, prefix="/media", tags=["Media"])
api_router.include_router(triage.router, prefix="/triage", tags=["Smart Triage & Cleanup"])
api_router.include_router(people.router, prefix="/people", tags=["People & Faces"])
api_router.include_router(sync.router, prefix="/sync", tags=["Sync & Sources"])
api_router.include_router(search.router, prefix="/search", tags=["Search & Events"])
api_router.include_router(albums.router, prefix="/albums", tags=["Albums & Collections"])

@api_router.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "MyMemoryPics API"}
