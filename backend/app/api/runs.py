"""Test runs, run history, approvals and automatic tests."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_agent_or_404, iso
from app.auth.security import get_current_user, get_workspace
from app.database import get_db
from app.models import Agent, AgentTest, ApprovalRequest, Execution, User, Workspace
from app.schemas import DecisionIn, RunIn, TestCaseIn
from app.services.runs import cancel_run, execute_agent, resume_after_decision

router = APIRouter(prefix="/api", tags=["runs"])


def execution_out(ex: Execution, validation: dict | None = None) -> dict:
    return {
        "id": ex.id, "agent_id": ex.agent_id, "source": ex.source, "status": ex.status, "inputs": ex.inputs,
        "reply": ex.output, "sources": ex.sources, "error": ex.error, "duration_ms": ex.duration_ms,
        "prompt_tokens": ex.prompt_tokens, "completion_tokens": ex.completion_tokens, "cost_usd": ex.cost_usd,
        "created_at": iso(ex.created_at), "finished_at": iso(ex.finished_at),
        "logs": [{"node_id": l.node_id, "node_type": l.node_type, "label": l.node_label, "status": l.status,
                  "message": l.message, "output_preview": l.output_preview, "error": l.error,
                  "duration_ms": l.duration_ms} for l in ex.node_logs],
        **({"validation": validation} if validation is not None else {}),
    }


@router.post("/agents/{agent_id}/run")
async def run_agent(agent_id: str, body: RunIn, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    """Run the current draft in the testing playground."""
    agent = get_agent_or_404(db, ws, agent_id)
    ex, report = await execute_agent(db, ws, agent, agent.draft_spec, body.message, body.history, "playground")
    return execution_out(ex, report.to_dict())


@router.get("/agents/{agent_id}/runs")
def list_runs(agent_id: str, limit: int = 30, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    get_agent_or_404(db, ws, agent_id)
    rows = db.scalars(select(Execution).where(Execution.agent_id == agent_id, Execution.workspace_id == ws.id)
                      .order_by(Execution.created_at.desc()).limit(min(limit, 100))).all()
    return [execution_out(r) for r in rows]


@router.get("/runs/{run_id}")
def get_run(run_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    ex = db.scalar(select(Execution).where(Execution.id == run_id, Execution.workspace_id == ws.id))
    if not ex:
        raise HTTPException(404, "Run not found.")
    return execution_out(ex)


@router.post("/runs/{run_id}/cancel")
def cancel(run_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    ex = db.scalar(select(Execution).where(Execution.id == run_id, Execution.workspace_id == ws.id))
    if not ex:
        raise HTTPException(404, "Run not found.")
    if ex.status == "waiting_approval":
        ex.status, ex.paused_state = "cancelled", None
        for ap in db.scalars(select(ApprovalRequest).where(ApprovalRequest.execution_id == ex.id,
                                                           ApprovalRequest.status == "pending")):
            ap.status = "rejected"
        db.commit()
        return {"cancelled": True}
    return {"cancelled": cancel_run(run_id)}


# ------------------------------------------------------------------ Approvals
@router.get("/approvals")
def list_approvals(status: str = "pending", ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    q = select(ApprovalRequest, Agent.name).join(Agent, Agent.id == ApprovalRequest.agent_id).where(
        ApprovalRequest.workspace_id == ws.id)
    if status != "all":
        q = q.where(ApprovalRequest.status == status)
    rows = db.execute(q.order_by(ApprovalRequest.created_at.desc()).limit(100)).all()
    return [{"id": r.id, "agent_id": r.agent_id, "agent_name": name, "execution_id": r.execution_id,
             "summary": r.summary, "status": r.status, "created_at": iso(r.created_at),
             "decided_at": iso(r.decided_at)} for r, name in rows]


@router.post("/approvals/{approval_id}/decide")
async def decide(approval_id: str, body: DecisionIn, ws: Workspace = Depends(get_workspace),
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ap = db.scalar(select(ApprovalRequest).where(ApprovalRequest.id == approval_id,
                                                 ApprovalRequest.workspace_id == ws.id))
    if not ap:
        raise HTTPException(404, "Approval request not found.")
    if ap.status != "pending":
        raise HTTPException(409, "This request has already been decided.")
    ap.note = body.note
    ex = await resume_after_decision(db, ap, body.decision, user.id)
    return execution_out(ex)


# ------------------------------------------------------------------ Automatic tests
def evaluate_assertion(t: AgentTest, ex: Execution) -> tuple[bool, str]:
    reply = ex.output or ""
    if ex.status not in ("succeeded",) and t.assertion != "succeeds":
        return False, f"The run didn't finish successfully ({ex.status})."
    if t.assertion == "succeeds":
        return ex.status == "succeeded", f"Run status: {ex.status}"
    if t.assertion == "contains":
        ok = t.expected.lower() in reply.lower()
        return ok, f"Reply {'contains' if ok else 'does not contain'} “{t.expected}”."
    if t.assertion == "not_contains":
        ok = t.expected.lower() not in reply.lower()
        return ok, f"Reply {'does not contain' if ok else 'contains'} “{t.expected}”."
    if t.assertion == "equals":
        ok = reply.strip() == t.expected.strip()
        return ok, "Reply matches exactly." if ok else "Reply is different."
    if t.assertion == "max_length":
        try:
            limit = int(t.expected)
        except ValueError:
            return False, "Expected value must be a number of characters."
        return len(reply) <= limit, f"Reply is {len(reply)} characters (limit {limit})."
    if t.assertion == "uses_documents":
        ok = bool(ex.sources)
        if ok and t.expected:
            ok = any(t.expected.lower() in s.get("filename", "").lower() for s in ex.sources)
        return ok, f"Used {len(ex.sources)} document passage(s)."
    return False, "Unknown check."


def test_out(t: AgentTest) -> dict:
    return {"id": t.id, "input_text": t.input_text, "assertion": t.assertion, "expected": t.expected,
            "last_result": t.last_result}


@router.get("/agents/{agent_id}/tests")
def list_tests(agent_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    get_agent_or_404(db, ws, agent_id)
    return [test_out(t) for t in db.scalars(select(AgentTest).where(AgentTest.agent_id == agent_id)
                                            .order_by(AgentTest.created_at))]


@router.post("/agents/{agent_id}/tests")
def add_test(agent_id: str, body: TestCaseIn, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    get_agent_or_404(db, ws, agent_id)
    t = AgentTest(agent_id=agent_id, input_text=body.input_text, assertion=body.assertion, expected=body.expected)
    db.add(t)
    db.commit()
    return test_out(t)


@router.delete("/agents/{agent_id}/tests/{test_id}")
def delete_test(agent_id: str, test_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    get_agent_or_404(db, ws, agent_id)
    t = db.scalar(select(AgentTest).where(AgentTest.id == test_id, AgentTest.agent_id == agent_id))
    if t:
        db.delete(t)
        db.commit()
    return {"ok": True}


@router.post("/agents/{agent_id}/tests/run")
async def run_tests(agent_id: str, ws: Workspace = Depends(get_workspace), db: Session = Depends(get_db)):
    agent = get_agent_or_404(db, ws, agent_id)
    tests = db.scalars(select(AgentTest).where(AgentTest.agent_id == agent_id).order_by(AgentTest.created_at)).all()
    results = []
    for t in tests:
        ex, _ = await execute_agent(db, ws, agent, agent.draft_spec, t.input_text, [], "test")
        passed, detail = evaluate_assertion(t, ex)
        t.last_result = {"passed": passed, "detail": detail, "reply": (ex.output or "")[:500], "run_id": ex.id,
                         "error": ex.error}
        db.commit()
        results.append(test_out(t))
    return {"results": results, "passed": sum(1 for r in results if r["last_result"]["passed"]),
            "total": len(results),
            "note": "These are deterministic checks on the reply text. They can't judge whether an answer is "
                    "actually correct; AI-graded evaluation isn't available in this version."}
