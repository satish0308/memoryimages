import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import bcrypt
import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User

JWT_SECRET_KEY = settings.SECRET_KEY or "memorypics_jwt_secret_dev_12345"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

def get_password_hash(password: str) -> str:
    """Hashes a password using bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Encodes a JWT payload with expiration."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        return None

def ensure_default_admin(db: Session) -> User:
    """
    Ensures at least one user exists in the database.
    Creates default admin (username: 'admin', password: 'password123') if empty.
    """
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        existing_count = db.query(User).count()
        if existing_count == 0:
            admin = User(
                username="admin",
                email="admin@memorypics.local",
                hashed_password=get_password_hash("password123"),
                full_name="Administrator",
                is_active=True,
                is_admin=True
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
    return admin
