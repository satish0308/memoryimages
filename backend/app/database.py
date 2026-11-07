import os
import logging
from typing import Optional
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)

def normalize_db_url(url: Optional[str]) -> str:
    """Ensures PostgreSQL connections use the installed psycopg2 driver dialect."""
    if url and url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url or ""

is_sqlite = settings.DATABASE_URL.startswith("sqlite")
is_postgres = settings.DATABASE_URL.startswith("postgresql")

# Ensure data directory exists for SQLite
if is_sqlite:
    db_path = settings.DATABASE_URL.replace("sqlite:////", "/")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

connect_args = {}
engine_kwargs = {"pool_pre_ping": True}

if is_sqlite:
    from sqlalchemy.pool import NullPool
    connect_args = {"check_same_thread": False, "timeout": 30}
    engine_kwargs.update({"poolclass": NullPool})
elif is_postgres:
    engine_kwargs.update({"pool_size": 20, "max_overflow": 40})

engine = create_engine(
    normalize_db_url(settings.DATABASE_URL),
    connect_args=connect_args,
    **engine_kwargs
)

# Enable WAL mode and optimized concurrency pragmas for SQLite
if is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA cache_size=-64000")
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.close()

# Auto-initialize pgvector extension if PostgreSQL is active
if is_postgres:
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            conn.commit()
            logger.info("PostgreSQL pgvector extension verified.")
    except Exception as e:
        logger.warning(f"Unable to auto-enable pgvector extension on startup: {e}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_db_dialect() -> str:
    """Returns 'postgresql' or 'sqlite' depending on the active DATABASE_URL."""
    return "postgresql" if is_postgres else "sqlite"

def check_pgvector_active(db_session=None) -> bool:
    """Checks if pgvector extension is installed and active in the database."""
    if not is_postgres:
        return False
    close_after = False
    if db_session is None:
        db_session = SessionLocal()
        close_after = True
    try:
        res = db_session.execute(text("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';")).fetchone()
        return res is not None
    except Exception:
        return False
    finally:
        if close_after:
            db_session.close()

def check_postgres_availability(url: str = None) -> dict:
    """Tests connection to PostgreSQL and checks pgvector support."""
    target_url = normalize_db_url(url or settings.POSTGRES_URL)
    try:
        test_engine = create_engine(target_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
        with test_engine.connect() as conn:
            ver = conn.execute(text("SELECT version();")).scalar()
            try:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                conn.commit()
            except Exception:
                pass
            vec_res = conn.execute(text("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';")).fetchone()
            has_pgvector = vec_res is not None
            vec_version = vec_res[1] if vec_res else None
            return {
                "available": True,
                "version": ver.split()[1] if ver else "Unknown",
                "pgvector_installed": has_pgvector,
                "pgvector_version": vec_version,
                "target_url": target_url.split("@")[-1] if "@" in target_url else target_url
            }
    except Exception as e:
        return {
            "available": False,
            "error": str(e),
            "target_url": target_url.split("@")[-1] if "@" in target_url else target_url
        }
