"""Publishing and the public hosted chat page API. Public endpoints expose only display info and chat."""
import copy
import hashlib
import hmac
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_agent_or_404, iso
from app.api.agents import agent_detail
from app.auth.security import get_workspace
from app.config import get_settings
from app.database import get_db
from app.models import Agent, Execution, Publication, Workspace, utcnow
from app.schemas import PublicationIn, PublicChatIn
from app.services.plans import get_plan
from app.services.rate_limit import enforce
from app.services.runs import execute_agent, validate_for_workspace

router = APIRouter(prefix="/api", tags=["publish"])


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "agent"
    return f"{s}-{secrets.token_hex(3)}"


def _view_token(run_id: str) -> str:
    return hmac.new(get_settings().jwt_secret.encode(), f"view:{run_id}".encode(), hashlib.sha256).hexdigest()[:32]


def _ensure_publication(db: Session, a: Agent) -> Publication:
    if a.publication is None:
        a.publication = Publication(agent_id=a.id, slug=_slugify(a.name), is_live=False, spec=a.draft_spec,
                                    display_name=a.name, description=a.description[:1000])
        db.flush()
    return a.publication


@router.put("/agents/{agent_id}/publication")
def update_publication(agent_id: str, body: PublicationIn, ws: Workspace = Depends(get_workspace),
                       db: Session = Depends(get_db)):
    a = get_agent_or_404(db, ws, agent_id)
    pub = _ensure_publication(db, a)
    if body.slug and body.slug != pub.slug:
        if db.scalar(select(Publication).where(Publication.slug == body.slug)):
            raise HTTPException(409, "That link is already taken. Try another.")
        pub.slug = body.slug
    pub.display_name, pub.description = body.display_name, body.description
    pub.welcome_message, pub.avatar_emoji, pub.accent_color = body.welcome_message, body.avatar_emoji, body.accent_color
    db.commit()
    return agent_detail(db, a)


@router.post("/agents/{agent_id}/publish")
def publish(agent_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    a = get_agent_or_404(db, ws, agent_id)
    report = validate_for_workspace(a.draft_spec)
    if not report.ok:
        raise HTTPException(422, {"message": "Fix the problems in your workflow before publishing.",
                                  "issues": [i.model_dump() for i in report.issues if i.severity == "error"]})
    plan = get_plan(ws.plan)
    live = db.scalars(select(Publication).join(Agent).where(Agent.workspace_id == ws.id, Publication.is_live,
                                                            Agent.id != a.id)).all()
    if len(live) >= plan.max_published:
        raise HTTPException(402, f"The {plan.name} plan allows {plan.max_published} published agent(s). "
                                 "Unpublish one or upgrade.")
    pub = _ensure_publication(db, a)
    from app.api.agents import save_version

    v = save_version(db, a, "Published")
    pub.spec, pub.version, pub.is_live, pub.published_at = copy.deepcopy(a.draft_spec), v.version, True, utcnow()
    a.status = "published"
    db.commit()
    return agent_detail(db, a)


@router.post("/agents/{agent_id}/unpublish")
def unpublish(agent_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    a = get_agent_or_404(db, ws, agent_id)
    if a.publication:
        a.publication.is_live = False
    a.status = "draft"
    db.commit()
    return agent_detail(db, a)


# ------------------------------------------------------------------ Public (no auth)
def _live_pub(db: Session, slug: str) -> Publication:
    pub = db.scalar(select(Publication).where(Publication.slug == slug, Publication.is_live))
    if not pub:
        raise HTTPException(404, "This agent isn't available.")
    return pub


@router.get("/public/{slug}")
def public_info(slug: str, request: Request, db: Session = Depends(get_db)):
    enforce(request, "public-info", 60)
    pub = _live_pub(db, slug)
    return {"slug": pub.slug, "name": pub.display_name, "description": pub.description,
            "welcome_message": pub.welcome_message, "avatar_emoji": pub.avatar_emoji,
            "accent_color": pub.accent_color}


@router.post("/public/{slug}/chat")
async def public_chat(slug: str, body: PublicChatIn, request: Request, db: Session = Depends(get_db)):
    enforce(request, "public-chat", get_settings().public_rate_limit_per_minute)
    enforce(request, f"public-chat-{slug}", get_settings().public_rate_limit_per_minute * 3)
    pub = _live_pub(db, slug)
    agent = db.get(Agent, pub.agent_id)
    ws = db.get(Workspace, agent.workspace_id)
    try:
        ex, _ = await execute_agent(db, ws, agent, pub.spec, body.message, body.history, "public")
    except HTTPException as e:
        if e.status_code == 402:  # don't reveal the owner's billing state to visitors
            raise HTTPException(503, "This assistant is temporarily unavailable. Please try again later.") from e
        raise
    return _public_run(ex)


def _public_run(ex: Execution) -> dict:
    # Visitors see the reply and source names only: never logs, prompts, or error internals.
    err = None
    if ex.error:
        err = "Sorry, I couldn't answer just now. Please try again later."
    return {"run_id": ex.id, "status": ex.status, "reply": ex.output, "error": err,
            "sources": list(dict.fromkeys(s.get("source_label", "") for s in (ex.sources or []))),
            "view_token": _view_token(ex.id), "created_at": iso(ex.created_at)}


@router.get("/public/{slug}/runs/{run_id}")
def public_run_status(slug: str, run_id: str, token: str, request: Request, db: Session = Depends(get_db)):
    enforce(request, "public-poll", 120)
    pub = _live_pub(db, slug)
    if not hmac.compare_digest(token, _view_token(run_id)):
        raise HTTPException(404, "Not found.")
    ex = db.scalar(select(Execution).where(Execution.id == run_id, Execution.agent_id == pub.agent_id))
    if not ex:
        raise HTTPException(404, "Not found.")
    return _public_run(ex)
