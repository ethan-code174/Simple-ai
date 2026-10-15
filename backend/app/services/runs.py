"""Glue between the API, the database and the pure workflow engine."""
import logging
from collections import defaultdict
from datetime import datetime, timezone
from threading import Lock

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.knowledge.search import search_chunks
from app.models import Agent, ApprovalRequest, DocumentChunk, Execution, NodeLog, UsageRecord, Workspace, utcnow
from app.providers.ollama import OllamaProvider
from app.providers.registry import get_registry
from app.services.plans import get_plan
from app.workflow.context import Limits, RunContext
from app.workflow.engine import CancelToken, RunOutcome, run_workflow, summarize_usage
from app.workflow.validator import ValidationReport, validate_workflow

log = logging.getLogger("aif.runs")

_cancel_tokens: dict[str, CancelToken] = {}
_active: dict[str, int] = defaultdict(int)
_active_lock = Lock()


def validate_for_workspace(spec: dict) -> ValidationReport:
    s = get_settings()
    reg = get_registry()
    return validate_workflow(spec, max_nodes=s.max_nodes, max_edges=s.max_edges, provider_ids=reg.ids(),
                             implemented_providers={p.id for p in reg.all() if p.implemented},
                             max_ai_calls=s.max_ai_calls_per_run)


def month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def month_usage(db: Session, workspace_id: str) -> dict:
    runs = db.scalar(select(func.count(Execution.id)).where(Execution.workspace_id == workspace_id,
                                                             Execution.created_at >= month_start())) or 0
    cost = db.scalar(select(func.coalesce(func.sum(UsageRecord.cost_usd), 0.0)).where(
        UsageRecord.workspace_id == workspace_id, UsageRecord.created_at >= month_start())) or 0.0
    return {"executions": int(runs), "cost_usd": float(cost)}


def check_run_allowed(db: Session, ws: Workspace) -> None:
    plan = get_plan(ws.plan)
    usage = month_usage(db, ws.id)
    if usage["executions"] >= plan.monthly_executions:
        raise HTTPException(402, f"You've used all {plan.monthly_executions} runs included in the {plan.name} plan "
                                 "this month. Upgrade your plan to keep going.")
    if usage["cost_usd"] > 0 and usage["cost_usd"] >= ws.monthly_spend_limit_usd:
        raise HTTPException(402, "Your monthly AI spending limit has been reached. Raise it in Billing to continue.")


def _knowledge_searcher(db: Session, workspace_id: str, agent_id: str):
    async def search(query: str, top_k: int) -> list[dict]:
        q_vec = None
        has_vectors = db.scalar(select(func.count(DocumentChunk.id)).where(
            DocumentChunk.workspace_id == workspace_id, DocumentChunk.agent_id == agent_id,
            DocumentChunk.embedding.is_not(None)))
        if has_vectors:
            prov = get_registry().get("ollama")
            if isinstance(prov, OllamaProvider):
                try:
                    q_vec = (await prov.embed(get_settings().ollama_embed_model, [query]))[0]
                except Exception:  # noqa: BLE001 - fall back to keyword ranking
                    q_vec = None
        return [p.to_dict() for p in search_chunks(db, workspace_id, agent_id, query, top_k, q_vec)]

    return search


def _sanitize_history(history: list[dict] | None) -> list[dict]:
    out = []
    for turn in (history or [])[-20:]:
        role = turn.get("role")
        content = str(turn.get("content", ""))[:4000]
        if role in ("user", "assistant") and content.strip():
            out.append({"role": role, "content": content})
    return out


def _persist_outcome(db: Session, ex: Execution, ctx: RunContext, outcome: RunOutcome, agent: Agent) -> None:
    usage = summarize_usage(ctx)
    ex.status = outcome.status
    ex.output = outcome.reply
    ex.sources = [{k: v for k, v in s.items() if k != "content"} | {"excerpt": s["content"][:300]} for s in ctx.sources]
    ex.error = outcome.error
    ex.duration_ms += outcome.duration_ms
    ex.prompt_tokens += usage["prompt_tokens"]
    ex.completion_tokens += usage["completion_tokens"]
    ex.cost_usd = round(ex.cost_usd + usage["cost_usd"], 6)
    ex.paused_state = outcome.paused_state
    if outcome.status != "waiting_approval":
        ex.finished_at = utcnow()
    seq = len(ex.node_logs)
    for i, l in enumerate(outcome.logs):
        db.add(NodeLog(execution_id=ex.id, seq=seq + i, node_id=l.node_id, node_type=l.node_type, node_label=l.label,
                       status=l.status, message=l.message, output_preview=l.output_preview, error=l.error,
                       duration_ms=l.duration_ms))
    for u in ctx.usage:
        db.add(UsageRecord(workspace_id=ex.workspace_id, agent_id=agent.id, execution_id=ex.id, provider=u.provider,
                           model=u.model, prompt_tokens=u.prompt_tokens, completion_tokens=u.completion_tokens,
                           cost_usd=u.cost_usd))
    if outcome.status == "waiting_approval" and outcome.pause_info:
        db.add(ApprovalRequest(workspace_id=ex.workspace_id, agent_id=agent.id, execution_id=ex.id,
                               node_id=outcome.pause_info["node_id"], summary=outcome.pause_info["summary"]))
    db.commit()
    db.refresh(ex)


def _limits() -> Limits:
    s = get_settings()
    return Limits(max_ai_calls=s.max_ai_calls_per_run, timeout_seconds=s.run_timeout_seconds,
                  provider_retries=s.provider_retries)


async def execute_agent(db: Session, ws: Workspace, agent: Agent, spec: dict, message: str,
                        history: list[dict] | None, source: str) -> tuple[Execution, ValidationReport]:
    report = validate_for_workspace(spec)
    check_run_allowed(db, ws)
    s = get_settings()
    with _active_lock:
        if _active[ws.id] >= s.max_concurrent_runs_per_user:
            raise HTTPException(429, "Too many runs at once. Wait for the current ones to finish.")
        _active[ws.id] += 1
    try:
        inputs = {"message": message[:8000]}
        ex = Execution(workspace_id=ws.id, agent_id=agent.id, source=source, status="running", inputs=inputs,
                       spec_snapshot=spec)
        db.add(ex)
        db.commit()
        token = CancelToken()
        _cancel_tokens[ex.id] = token
        # Map the chat message onto the workflow's input block(s).
        variables = {}
        if report.spec:
            for n in report.spec.nodes:
                if n.type == "input" and n.id in report.configs:
                    variables[report.configs[n.id].name] = inputs["message"]
        ctx = RunContext(providers=get_registry(), vars=variables, history=_sanitize_history(history),
                         knowledge=_knowledge_searcher(db, ws.id, agent.id), limits=_limits())
        outcome = await run_workflow(report, ctx, cancel=token)
        _persist_outcome(db, ex, ctx, outcome, agent)
        log.info("run %s agent=%s status=%s ms=%s", ex.id, agent.id, ex.status, ex.duration_ms)
        return ex, report
    finally:
        if "ex" in locals():
            _cancel_tokens.pop(ex.id, None)
        with _active_lock:
            _active[ws.id] -= 1


async def resume_after_decision(db: Session, approval: ApprovalRequest, decision: str, user_id: str) -> Execution:
    ex = db.get(Execution, approval.execution_id)
    agent = db.get(Agent, approval.agent_id)
    if ex is None or agent is None or ex.status != "waiting_approval" or not ex.paused_state:
        raise HTTPException(409, "This request has already been handled.")
    approval.status, approval.decided_by, approval.decided_at = decision, user_id, utcnow()
    report = validate_for_workspace(ex.spec_snapshot)
    ctx = RunContext(providers=get_registry(), knowledge=_knowledge_searcher(db, ex.workspace_id, agent.id),
                     limits=_limits())
    outcome = await run_workflow(report, ctx, resume={"state": ex.paused_state, "decision": decision})
    _persist_outcome(db, ex, ctx, outcome, agent)
    return ex


def cancel_run(execution_id: str) -> bool:
    token = _cancel_tokens.get(execution_id)
    if token:
        token.cancel()
        return True
    return False
