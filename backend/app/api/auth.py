import time
from datetime import datetime
from typing import Optional, List, Dict, Tuple
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, status, Header, Query, Cookie
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User, InviteToken
from app.services.auth_service import (
    get_password_hash,
    verify_password,
    create_access_token,
    decode_access_token,
    ensure_default_admin
)

router = APIRouter()

# --- Request / Response Schemas ---

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    full_name: Optional[str] = None
    invite_code: Optional[str] = None

class LoginRequest(BaseModel):
    username_or_email: str
    password: str

class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    is_admin: bool
    is_active: bool
    role: Optional[str] = "member"
    storage_quota_bytes: Optional[int] = 0

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# --- Authentication Dependency ---

def _extract_token(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    cookie_token: Optional[str] = Cookie(None, alias="memorypics_token")
) -> Optional[str]:
    """Extracts JWT token from Authorization Bearer header, URL query, or browser cookie."""
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "").strip()
    if token and token.strip():
        return token.strip()
    if cookie_token and cookie_token.strip():
        return cookie_token.strip()
    return None

def get_cached_user(db: Session, user_id: int) -> Optional[User]:
    """Retrieves authenticated user strictly bound to the active request session."""
    return db.query(User).filter(User.id == user_id, User.is_active == True).first()

def invalidate_user_cache(user_id: Optional[int] = None):
    pass

def get_current_user(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    cookie_token: Optional[str] = Cookie(None, alias="memorypics_token"),
    db: Session = Depends(get_db)
) -> User:
    """
    Extracts and verifies JWT token from Authorization header, Query param, or Cookie.
    Returns User if valid, or raises HTTPException 401.
    """
    raw_token = _extract_token(authorization, token, cookie_token)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_access_token(raw_token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(payload.get("sub"))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject format.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = get_cached_user(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or account disabled.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

def get_optional_current_user(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    cookie_token: Optional[str] = Cookie(None, alias="memorypics_token"),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Returns the current user if a valid token is present, otherwise None."""
    raw_token = _extract_token(authorization, token, cookie_token)
    if not raw_token:
        return None
    try:
        payload = decode_access_token(raw_token)
        if not payload or "sub" not in payload:
            return None
        user_id = int(payload["sub"])
        return get_cached_user(db, user_id)
    except Exception:
        return None

# --- Endpoints ---

@router.post("/register", response_model=AuthResponse)
def register_user(req: RegisterRequest, db: Session = Depends(get_db)):
    """Registers a new user account."""
    username = req.username.strip()
    email = req.email.strip().lower()
    
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Check if username or email is taken
    if db.query(User).filter(func.lower(User.username) == username.lower()).first():
        raise HTTPException(status_code=400, detail="Username already in use")
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # If first registered user, grant admin status
    is_first_user = db.query(User).count() == 0
    assigned_role = "admin" if is_first_user else "member"
    assigned_quota = 0
    valid_invite = None

    if req.invite_code:
        valid_invite = db.query(InviteToken).filter(
            InviteToken.code == req.invite_code.strip(),
            InviteToken.is_used == False
        ).first()
        if not valid_invite:
            raise HTTPException(status_code=400, detail="Invalid or already used invite token")
        if valid_invite.expires_at and valid_invite.expires_at < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Invite token has expired")
        assigned_role = valid_invite.role or "member"
        assigned_quota = valid_invite.quota_bytes or 0

    user = User(
        username=username,
        email=email,
        hashed_password=get_password_hash(req.password),
        full_name=req.full_name.strip() if req.full_name else username,
        is_active=True,
        is_admin=(assigned_role == "admin" or is_first_user),
        role=assigned_role,
        storage_quota_bytes=assigned_quota
    )
    db.add(user)
    db.flush()

    if valid_invite:
        valid_invite.is_used = True
        valid_invite.used_by_user_id = user.id

    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "username": user.username, "is_admin": user.is_admin})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "is_admin": user.is_admin,
            "is_active": user.is_active,
            "role": user.role,
            "storage_quota_bytes": user.storage_quota_bytes or 0
        }
    }

@router.post("/login", response_model=AuthResponse)
def login_user(req: LoginRequest, db: Session = Depends(get_db)):
    """Authenticates with username or email and password."""
    # Ensure default admin exists if DB is completely empty
    ensure_default_admin(db)

    identifier = req.username_or_email.strip()
    user = db.query(User).filter(
        (func.lower(User.username) == identifier.lower()) | 
        (func.lower(User.email) == identifier.lower())
    ).first()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username/email or password"
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token = create_access_token({"sub": str(user.id), "username": user.username, "is_admin": user.is_admin})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "is_admin": user.is_admin,
            "is_active": user.is_active,
            "role": user.role or ("admin" if user.is_admin else "member"),
            "storage_quota_bytes": user.storage_quota_bytes or 0
        }
    }

@router.get("/me", response_model=UserResponse)
def get_current_user_profile(user: User = Depends(get_current_user)):
    """Returns profile for currently authenticated user."""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "role": user.role or ("admin" if user.is_admin else "member"),
        "storage_quota_bytes": user.storage_quota_bytes or 0
    }

@router.patch("/me", response_model=UserResponse)
def update_profile(
    req: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Updates user name, email, or password."""
    if req.full_name is not None:
        user.full_name = req.full_name.strip()
    if req.email is not None:
        email = req.email.strip().lower()
        if email != user.email:
            if db.query(User).filter(func.lower(User.email) == email, User.id != user.id).first():
                raise HTTPException(status_code=400, detail="Email already in use")
            user.email = email

    if req.new_password:
        if not req.current_password:
            raise HTTPException(status_code=400, detail="Current password required to change password")
        if not verify_password(req.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        if len(req.new_password) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
        user.hashed_password = get_password_hash(req.new_password)

    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "role": user.role or ("admin" if user.is_admin else "member"),
        "storage_quota_bytes": user.storage_quota_bytes or 0
    }

@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    """Lists registered user accounts for quick switcher."""
    ensure_default_admin(db)
    users = db.query(User).filter(User.is_active == True).all()
    return [{
        "id": u.id,
        "username": u.username,
        "full_name": u.full_name,
        "email": u.email,
        "is_admin": u.is_admin
    } for u in users]

@router.post("/logout")
def logout():
    """Client-side token invalidation."""
    return {"status": "logged_out"}

@router.get("/google/url")
def get_google_sign_in_url():
    """Returns the Google OAuth sign-in URL for mandatory Google account authentication."""
    from app.services.google_sync import get_google_auth_url
    res = get_google_auth_url()
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

from fastapi.responses import RedirectResponse

@router.get("/google/callback")
def auth_google_callback(
    code: str,
    state: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Google OAuth callback specifically under /auth/google/callback."""
    from app.services.google_sync import handle_oauth_callback
    import urllib.parse
    res = handle_oauth_callback(db, code, state)
    if res.get("status") == "error":
        err_msg = urllib.parse.quote(str(res.get("error", "Google authentication failed")))
        return RedirectResponse(url=f"http://localhost:3000/login?error={err_msg}")

    token = res.get("access_token")
    user = res.get("user")
    if token and user:
        query = urllib.parse.urlencode({
            "token": token,
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "full_name": user.get("full_name") or "",
            "is_admin": "true" if user.get("is_admin") else "false",
            "provider": "google"
        })
        return RedirectResponse(url=f"http://localhost:3000/login?{query}")

    return RedirectResponse(url="http://localhost:3000/login?status=google_connected")
