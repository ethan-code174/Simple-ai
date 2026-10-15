"""Dashboard, analytics, templates, providers, block library, billing, health."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.agents import agent_summary
from app.api.deps import get_agent_or_404, iso
from app.architect.templates import list_templates
from app.auth.security import get_workspace
from app.config import get_settings
from app.database import get_db
from app.models import Agent, ApprovalRequest, Execution, Subscription, Workspace
from app.providers.registry import get_registry
from app.schemas import LimitsIn
from app.services.plans import get_plan, plans_payload
from app.services.runs import month_usage
from app.workflow.blocks import BLOCKS

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/blocks")
def blocks():
    return [b.describe() for b in BLOCKS.values()]


@router.get("/templates")
def templates():
    return list_templates()


@router.get("/providers")
async def providers():
    out = []
    for p in get_registry().all():
        st = await p.status()
        out.append({**p.describe(), "available": st.available, "status_message": st.message,
                    "models": [m.__dict__ for m in st.models]})
    return out


def _stats(rows) -> dict:
    total = len(rows)
    ok = sum(1 for r in rows if r.status == "succeeded")
    failed = sum(1 for r in rows if r.status in ("failed", "cancelled"))
    durations = [r.duration_ms for r in rows if r.status == "succeeded"]
    return {"executions": total, "succeeded": ok, "failed": failed,
            "waiting": sum(1 for r in rows if r.status == "waiting_approval"),
            "avg_duration_ms": int(sum(durations) / len(durations)) if durations else None,
            "prompt_tokens": sum(r.prompt_tokens for r in rows),
            "completion_tokens": sum(r.completion_tokens for r in rows),
            "cost_usd": round(sum(r.cost_usd for r in rows), 6)}


@router.get("/dashboard")
def dashboard(ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    agents = db.scalars(select(Agent).where(Agent.workspace_id == ws.id).order_by(Agent.updated_at.desc())).all()
    runs = db.scalars(select(Execution).where(Execution.workspace_id == ws.id)).all()
    names = {a.id: a.name for a in agents}
    recent = db.scalars(select(Execution).where(Execution.workspace_id == ws.id)
                        .order_by(Execution.created_at.desc()).limit(8)).all()
    pending = db.scalar(select(func.count(ApprovalRequest.id)).where(ApprovalRequest.workspace_id == ws.id,
                                                                     ApprovalRequest.status == "pending")) or 0
    return {
        "totals": {"agents": len(agents), "active_agents": sum(1 for a in agents if a.status == "published"),
                   **_stats(runs), "pending_approvals": pending},
        "month": month_usage(db, ws.id),
        "recent_agents": [agent_summary(db, a) for a in agents[:6]],
        "recent_activity": [{"id": r.id, "agent_id": r.agent_id, "agent_name": names.get(r.agent_id, "?"),
                             "status": r.status, "source": r.source, "message": (r.inputs or {}).get("message", "")[:120],
                             "created_at": iso(r.created_at), "duration_ms": r.duration_ms} for r in recent],
    }


@router.get("/analytics")
def analytics(agent_id: str | None = None, days: int = 14, ws: Workspace = Depends(get_workspace),
              db: Session = Depends(get_db)):
    q = select(Execution).where(Execution.workspace_id == ws.id)
    if agent_id:
        get_agent_or_404(db, ws, agent_id)
        q = q.where(Execution.agent_id == agent_id)
    rows = db.scalars(q).all()
    days = max(1, min(days, 90))
    today = datetime.now(timezone.utc).date()
    series = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        day_rows = [r for r in rows if r.created_at and r.created_at.date() == d]
        series.append({"date": d.isoformat(), "executions": len(day_rows),
                       "failed": sum(1 for r in day_rows if r.status == "failed")})
    agents = db.scalars(select(Agent).where(Agent.workspace_id == ws.id)).all()
    per_agent = []
    for a in agents:
        ar = [r for r in rows if r.agent_id == a.id]
        if ar or not agent_id:
            per_agent.append({"agent_id": a.id, "name": a.name, **_stats(ar)})
    return {"totals": _stats(rows), "series": series, "per_agent": per_agent}


@router.get("/billing")
def billing(ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    plan = get_plan(ws.plan)
    sub = db.scalar(select(Subscription).where(Subscription.workspace_id == ws.id))
    usage = month_usage(db, ws.id)
    warn = usage["executions"] >= 0.8 * plan.monthly_executions
    return {"plan": plan.__dict__, "subscription_status": sub.status if sub else "active", "usage": usage,
            "monthly_spend_limit_usd": ws.monthly_spend_limit_usd, "plans": plans_payload(),
            "usage_warning": f"You've used {usage['executions']} of {plan.monthly_executions} runs this month." if warn else None,
            "stripe_configured": False,
            "stripe_note": "Payments aren't connected yet. Plan upgrades will use Stripe Checkout once configured."}


@router.patch("/billing/limits")
def set_limits(body: LimitsIn, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    ws.monthly_spend_limit_usd = body.monthly_spend_limit_usd
    db.commit()
    return {"monthly_spend_limit_usd": ws.monthly_spend_limit_usd}


@router.get("/settings/runtime")
def runtime_settings(ws: Workspace = Depends(get_workspace)):
    s = get_settings()
    return {"max_nodes": s.max_nodes, "run_timeout_seconds": s.run_timeout_seconds,
            "max_ai_calls_per_run": s.max_ai_calls_per_run,
            "max_concurrent_runs": s.max_concurrent_runs_per_user, "max_upload_mb": s.max_upload_mb,
            "ollama_base_url": s.ollama_base_url, "auth_mode": s.auth_mode,
            "public_base_url": s.public_base_url, "test_provider_enabled": s.enable_test_provider}
