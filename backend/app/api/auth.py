from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import (
    create_token,
    ensure_workspace,
    get_current_user,
    hash_password,
    hash_reset_token,
    new_reset_token,
    verify_password,
)
from app.config import get_settings
from app.database import get_db
from app.models import PasswordResetToken, User
from app.schemas import ForgotIn, LoginIn, ProfileIn, ResetIn, SignupIn
from app.services.rate_limit import enforce

router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "display_name": u.display_name, "auth_provider": u.auth_provider}


def _local_only() -> None:
    if get_settings().auth_mode != "local":
        raise HTTPException(400, "Accounts are managed by Supabase in this deployment.")


@router.get("/config")
def auth_config():
    s = get_settings()
    return {"mode": s.auth_mode, "supabase_url": s.supabase_url if s.auth_mode == "supabase" else None}


@router.post("/signup")
def signup(body: SignupIn, request: Request, db: Session = Depends(get_db)):
    _local_only()
    enforce(request, "auth", get_settings().auth_rate_limit_per_minute)
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists. Try signing in.")
    user = User(email=email, password_hash=hash_password(body.password),
                display_name=body.display_name or email.split("@")[0])
    db.add(user)
    db.commit()
    ensure_workspace(db, user)
    return {"token": create_token(user.id), "user": user_out(user)}


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    _local_only()
    enforce(request, "auth", get_settings().auth_rate_limit_per_minute)
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "That email and password don't match.")
    return {"token": create_token(user.id), "user": user_out(user)}


@router.post("/forgot")
def forgot(body: ForgotIn, request: Request, db: Session = Depends(get_db)):
    _local_only()
    enforce(request, "auth", get_settings().auth_rate_limit_per_minute)
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    resp: dict = {"ok": True, "message": "If that account exists, a reset link has been created."}
    if user:
        raw, hashed = new_reset_token()
        db.add(PasswordResetToken(user_id=user.id, token_hash=hashed,
                                  expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        db.commit()
        # No email service is configured in the MVP. In development the token is returned so the flow can be
        # completed; in production set AIF_DEV_SHOW_RESET_TOKEN=false and wire an email provider.
        if get_settings().dev_show_reset_token:
            resp["dev_reset_token"] = raw
    return resp


@router.post("/reset")
def reset(body: ResetIn, db: Session = Depends(get_db)):
    _local_only()
    row = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_reset_token(body.token)))
    exp = row.expires_at if row else None
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not row or row.used or exp < datetime.now(timezone.utc):
        raise HTTPException(400, "This reset link is invalid or has expired.")
    user = db.get(User, row.user_id)
    user.password_hash = hash_password(body.password)
    row.used = True
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = ensure_workspace(db, user)
    return {"user": user_out(user), "workspace": {"id": ws.id, "name": ws.name, "plan": ws.plan}}


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.display_name = body.display_name.strip()
    db.commit()
    return {"user": user_out(user)}
