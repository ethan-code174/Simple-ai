"""Authentication. Local mode: email + bcrypt password + HS256 JWT. Supabase mode: verify Supabase JWTs."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Subscription, User, Workspace


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


def create_token(user_id: str) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": user_id, "iat": now, "exp": now + timedelta(minutes=s.jwt_expire_minutes),
                       "iss": "ai-factory"}, s.jwt_secret, algorithm="HS256")


def new_reset_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def ensure_workspace(db: Session, user: User) -> Workspace:
    ws = db.scalar(select(Workspace).where(Workspace.owner_id == user.id).order_by(Workspace.created_at))
    if ws is None:
        ws = Workspace(name=f"{(user.display_name or user.email.split('@')[0])}'s workspace", owner_id=user.id)
        db.add(ws)
        db.flush()
        db.add(Subscription(workspace_id=ws.id, plan="free"))
        db.commit()
    return ws


_UNAUTH = HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in again.", headers={"WWW-Authenticate": "Bearer"})


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise _UNAUTH
    token = auth[7:].strip()
    s = get_settings()
    if s.auth_mode == "supabase":
        try:
            claims = jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
        except jwt.PyJWTError:
            raise _UNAUTH from None
        user = db.get(User, claims["sub"])
        if user is None:  # first visit: mirror the Supabase user into our profiles table
            user = User(id=claims["sub"], email=claims.get("email", f"{claims['sub']}@supabase"), auth_provider="supabase")
            db.add(user)
            db.commit()
        return user
    try:
        claims = jwt.decode(token, s.jwt_secret, algorithms=["HS256"], issuer="ai-factory")
    except jwt.PyJWTError:
        raise _UNAUTH from None
    user = db.get(User, claims.get("sub"))
    if user is None:
        raise _UNAUTH
    return user


def get_workspace(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Workspace:
    return ensure_workspace(db, user)
