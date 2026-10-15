"""Agents, their workflows, versions, and The Architect."""
import copy

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_agent_or_404, iso
from app.architect.editor import propose_edit
from app.architect.planner import build_plan
from app.architect.templates import build_template
from app.auth.security import get_workspace
from app.config import get_settings
from app.database import get_db
from app.models import Agent, Execution, Workspace, WorkflowVersion
from app.schemas import (
    AgentCreateIn,
    AgentPatchIn,
    ArchitectApplyIn,
    ArchitectCreateIn,
    ArchitectProposeIn,
    VersionIn,
    WorkflowIn,
)
from app.services.plans import get_plan
from app.services.runs import validate_for_workspace
from app.workflow.layout import auto_layout
from app.workflow.spec import WorkflowSpec

router = APIRouter(prefix="/api", tags=["agents"])


def starter_spec() -> dict:
    """A minimal Input -> Prompt -> AI Model -> Output workflow for blank agents."""
    plan = build_plan("a helpful assistant", provider="ollama", model=get_settings().ollama_default_model)
    return plan.spec


def normalise(spec: dict) -> dict:
    """Parse with the strict schema and re-dump, dropping anything unexpected."""
    try:
        return WorkflowSpec.model_validate(spec).model_dump()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"That workflow isn't in a valid format: {e}") from e


def primary_model(spec: dict) -> str | None:
    for n in spec.get("nodes", []):
        if n.get("type") == "ai_model":
            c = n.get("config", {})
            return f"{c.get('provider', '?')} · {c.get('model', '?')}"
    return None


def agent_summary(db: Session, a: Agent) -> dict:
    runs = db.scalar(select(func.count(Execution.id)).where(Execution.agent_id == a.id)) or 0
    pub = a.publication
    return {"id": a.id, "name": a.name, "description": a.description, "status": a.status,
            "updated_at": iso(a.updated_at), "created_at": iso(a.created_at), "model": primary_model(a.draft_spec),
            "executions": runs, "current_version": a.current_version,
            "public_slug": pub.slug if pub and pub.is_live else None}


def agent_detail(db: Session, a: Agent) -> dict:
    report = validate_for_workspace(a.draft_spec)
    pub = a.publication
    return {**agent_summary(db, a), "spec": a.draft_spec, "validation": report.to_dict(),
            "publication": None if not pub else {
                "slug": pub.slug, "is_live": pub.is_live, "version": pub.version, "display_name": pub.display_name,
                "description": pub.description, "welcome_message": pub.welcome_message,
                "avatar_emoji": pub.avatar_emoji, "accent_color": pub.accent_color, "published_at": iso(pub.published_at)}}


def save_version(db: Session, a: Agent, note: str) -> WorkflowVersion:
    a.current_version += 1
    v = WorkflowVersion(agent_id=a.id, version=a.current_version, spec=copy.deepcopy(a.draft_spec), note=note[:300])
    db.add(v)
    return v


def check_agent_quota(db: Session, ws: Workspace) -> None:
    plan = get_plan(ws.plan)
    count = db.scalar(select(func.count(Agent.id)).where(Agent.workspace_id == ws.id)) or 0
    if count >= plan.max_agents:
        raise HTTPException(402, f"The {plan.name} plan allows {plan.max_agents} agents. Delete one or upgrade.")


@router.get("/agents")
def list_agents(ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    agents = db.scalars(select(Agent).where(Agent.workspace_id == ws.id).order_by(Agent.updated_at.desc())).all()
    return [agent_summary(db, a) for a in agents]


@router.post("/agents")
def create_agent(body: AgentCreateIn, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    check_agent_quota(db, ws)
    a = Agent(workspace_id=ws.id, name=body.name, description=body.description, draft_spec=starter_spec())
    db.add(a)
    db.flush()
    save_version(db, a, "Created")
    db.commit()
    return agent_detail(db, a)


@router.post("/agents/from-template/{template_id}")
def create_from_template(template_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    check_agent_quota(db, ws)
    t, plan = build_template(template_id, "ollama", get_settings().ollama_default_model)
    if plan is None:
        raise HTTPException(404, "Template not found or not available.")
    a = Agent(workspace_id=ws.id, name=plan.name, description=plan.description, draft_spec=plan.spec,
              created_from=f"template:{template_id}")
    db.add(a)
    db.flush()
    save_version(db, a, f"Created from template “{t['name']}”")
    db.commit()
    return agent_detail(db, a)


@router.get("/agents/{agent_id}")
def get_agent(agent_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    return agent_detail(db, get_agent_or_404(db, ws, agent_id))


@router.patch("/agents/{agent_id}")
def patch_agent(agent_id: str, body: AgentPatchIn, ws: Workspace = Depends(get_workspace),
                db: Session = Depends(get_db)):
    a = get_agent_or_404(db, ws, agent_id)
    if body.name is not None:
        a.name = body.name.strip()
    if body.description is not None:
        a.description = body.description
    db.commit()
    return agent_summary(db, a)


@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    a = get_agent_or_404(db, ws, agent_id)
    db.delete(a)
    db.commit()
    return {"ok": True}


@router.post("/agents/{agent_id}/duplicate")
def duplicate_agent(agent_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    check_agent_quota(db, ws)
    src = get_agent_or_404(db, ws, agent_id)
    a = Agent(workspace_id=ws.id, name=f"{src.name} (copy)"[:120], description=src.description,
              draft_spec=copy.deepcopy(src.draft_spec), created_from=f"copy:{src.id}")
    db.add(a)
    db.flush()
    save_version(db, a, f"Copied from “{src.name}”")
    db.commit()
    return agent_summary(db, a)


@router.put("/agents/{agent_id}/workflow")
def autosave_workflow(agent_id: str, body: WorkflowIn, ws: Workspace = Depends(get_workspace),
                      db: Session = Depends(get_db)):
    """Autosave the draft. Invalid workflows can still be saved (so work isn't lost) but can't run or publish."""
    a = get_agent_or_404(db, ws, agent_id)
    spec = normalise(body.spec)
    if len(spec["nodes"]) > get_settings().max_nodes:
        raise HTTPException(422, f"Workflows can have at most {get_settings().max_nodes} blocks.")
    a.draft_spec = spec
    db.commit()
    return {"saved": True, "updated_at": iso(a.updated_at), "validation": validate_for_workspace(spec).to_dict()}


@router.post("/agents/{agent_id}/validate")
def validate_agent(agent_id: str, body: WorkflowIn, ws: Workspace = Depends(get_workspace),
                   db: Session = Depends(get_db)):
    get_agent_or_404(db, ws, agent_id)
    return validate_for_workspace(body.spec).to_dict()


@router.post("/workflows/layout")
def layout(body: WorkflowIn, ws: Workspace = Depends(get_workspace)):
    return auto_layout(normalise(body.spec))


@router.get("/agents/{agent_id}/versions")
def list_versions(agent_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    a = get_agent_or_404(db, ws, agent_id)
    return [{"version": v.version, "note": v.note, "created_at": iso(v.created_at),
             "blocks": len(v.spec.get("nodes", []))} for v in reversed(a.versions)]


@router.post("/agents/{agent_id}/versions")
def create_version(agent_id: str, body: VersionIn, ws: Workspace = Depends(get_workspace),
                   db: Session = Depends(get_db)):
    a = get_agent_or_404(db, ws, agent_id)
    v = save_version(db, a, body.note or "Saved")
    db.commit()
    return {"version": v.version}


@router.post("/agents/{agent_id}/versions/{version}/restore")
def restore_version(agent_id: str, version: int, ws: Workspace = Depends(get_workspace),
                    db: Session = Depends(get_db)):
    a = get_agent_or_404(db, ws, agent_id)
    v = next((v for v in a.versions if v.version == version), None)
    if v is None:
        raise HTTPException(404, "Version not found.")
    a.draft_spec = copy.deepcopy(v.spec)
    save_version(db, a, f"Restored version {version}")
    db.commit()
    return agent_detail(db, a)


# ------------------------------------------------------------------ The Architect
@router.post("/architect/create")
def architect_create(body: ArchitectCreateIn, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    check_agent_quota(db, ws)
    plan = build_plan(body.prompt, provider="ollama", model=get_settings().ollama_default_model)
    report = validate_for_workspace(plan.spec)
    if not report.ok:  # should never happen; the planner only emits supported blocks
        raise HTTPException(500, "The Architect produced an invalid workflow: " +
                            "; ".join(i.message for i in report.issues if i.severity == "error"))
    a = Agent(workspace_id=ws.id, name=plan.name, description=plan.description, draft_spec=plan.spec,
              created_from="architect")
    db.add(a)
    db.flush()
    save_version(db, a, "Built by The Architect")
    db.commit()
    return {"agent": agent_detail(db, a), "explanation": plan.explanation,
            "unsupported": plan.analysis.unsupported, "recognised": plan.analysis.recognised}


@router.post("/agents/{agent_id}/architect/propose")
def architect_propose(agent_id: str, body: ArchitectProposeIn, ws: Workspace = Depends(get_workspace),
                      db: Session = Depends(get_db)):
    a = get_agent_or_404(db, ws, agent_id)
    base = normalise(body.spec) if body.spec else a.draft_spec
    p = propose_edit(base, body.instruction)
    report = validate_for_workspace(p.spec)
    return {"understood": p.understood, "message": p.message, "summary": p.summary, "changes": p.changes,
            "unsupported": p.unsupported, "spec": p.spec, "validation": report.to_dict()}


@router.post("/agents/{agent_id}/architect/apply")
def architect_apply(agent_id: str, body: ArchitectApplyIn, ws: Workspace = Depends(get_workspace),
                    db: Session = Depends(get_db)):
    a = get_agent_or_404(db, ws, agent_id)
    spec = normalise(body.spec)
    report = validate_for_workspace(spec)
    if report.spec is None:
        raise HTTPException(422, "That change produced an invalid workflow.")
    # Save the pre-change state first so the change is one click to undo.
    save_version(db, a, "Before Architect change")
    a.draft_spec = spec
    note = "Architect: " + "; ".join(s.replace("**", "") for s in body.summary)[:280] if body.summary else "Architect change"
    v = save_version(db, a, note)
    db.commit()
    return {"agent": agent_detail(db, a), "version": v.version}
