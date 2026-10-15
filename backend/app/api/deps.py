from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agent, Workspace


def get_agent_or_404(db: Session, ws: Workspace, agent_id: str) -> Agent:
    """Ownership check: an agent is only visible inside its own workspace."""
    agent = db.scalar(select(Agent).where(Agent.id == agent_id, Agent.workspace_id == ws.id))
    if agent is None:
        raise HTTPException(404, "Agent not found.")
    return agent


def iso(dt) -> str | None:
    return dt.isoformat() if dt else None
