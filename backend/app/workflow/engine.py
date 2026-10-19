"""The workflow engine. Pure: it takes a spec + inputs + injected services and returns a result.
No database access here, so it is independently testable."""
import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from app.services.errors import FriendlyError, friendly
from app.workflow.blocks import BLOCKS
from app.workflow.context import RunContext
from app.workflow.validator import ValidationReport

log = logging.getLogger("aif.engine")


@dataclass
class NodeLogEntry:
    node_id: str
    node_type: str
    label: str
    status: str  # succeeded | failed | skipped | paused
    message: str = ""
    output_preview: str = ""
    error: dict | None = None
    duration_ms: int = 0


@dataclass
class RunOutcome:
    status: str  # succeeded | failed | waiting_approval | rejected | cancelled
    reply: str | None
    logs: list[NodeLogEntry] = field(default_factory=list)
    error: dict | None = None
    paused_state: dict | None = None
    pause_info: dict | None = None
    duration_ms: int = 0


class CancelToken:
    def __init__(self) -> None:
        self.cancelled = False

    def cancel(self) -> None:
        self.cancelled = True


async def run_workflow(report: ValidationReport, ctx: RunContext, *, cancel: CancelToken | None = None,
                       resume: dict | None = None) -> RunOutcome:
    """Run a validated workflow. `resume` continues a run paused at a Ask me first block:
    {"state": <paused_state>, "decision": "approved"|"rejected"}."""
    if not report.ok or report.spec is None:
        err = friendly("invalid_workflow", "; ".join(i.message for i in report.issues if i.severity == "error"))
        return RunOutcome(status="failed", reply=None, error=err.to_dict())

    started = time.perf_counter()
    outcome = RunOutcome(status="running", reply=None)
    try:
        await asyncio.wait_for(_execute(report, ctx, outcome, cancel or CancelToken(), resume),
                               timeout=ctx.limits.timeout_seconds)
    except asyncio.TimeoutError:
        outcome.status = "failed"
        outcome.error = friendly("run_timeout", f"Exceeded {ctx.limits.timeout_seconds}s").to_dict()
    outcome.duration_ms = int((time.perf_counter() - started) * 1000)
    return outcome


async def _execute(report: ValidationReport, ctx: RunContext, outcome: RunOutcome, cancel: CancelToken,
                   resume: dict | None) -> None:
    spec = report.spec
    nodes = {n.id: n for n in spec.nodes}
    edges = list(spec.edges)

    branches: dict[str, str | None] = {}  # executed node id -> branch taken (or None)
    start_index = 0
    if resume:
        st = resume["state"]
        ctx.vars.update(st["vars"])
        ctx.sources[:] = st.get("sources", [])
        ctx.ai_calls = st.get("ai_calls", 0)
        branches = dict(st["branches"])
        start_index = st["next_index"]
        paused_node = st["paused_node"]
        if resume["decision"] == "rejected":
            outcome.logs.append(NodeLogEntry(paused_node, "human_approval", nodes[paused_node].label or "Ask me first",
                                             "failed", "Rejected by a reviewer"))
            outcome.status = "rejected"
            outcome.reply = st.get("rejected_reply") or "Sorry, we can't help with that request."
            return
        outcome.logs.append(NodeLogEntry(paused_node, "human_approval", nodes[paused_node].label or "Ask me first",
                                         "succeeded", "Approved by a reviewer"))

    def edge_live(e) -> bool:
        if e.source not in branches:
            return False
        taken = branches[e.source]
        return taken is None or (e.source_handle or "out") == taken

    for idx in range(start_index, len(report.order)):
        nid = report.order[idx]
        node = nodes[nid]
        block = BLOCKS[node.type]
        label = node.label or block.label
        if cancel.cancelled:
            outcome.status = "cancelled"
            outcome.error = friendly("cancelled").to_dict()
            return
        incoming = [e for e in edges if e.target == nid]
        if node.type != "input" and not any(edge_live(e) for e in incoming):
            outcome.logs.append(NodeLogEntry(nid, node.type, label, "skipped", "Not on the path taken"))
            continue

        t0 = time.perf_counter()
        try:
            result = await block.execute(report.configs[nid], ctx, nid)
        except FriendlyError as e:
            e.node_id = e.node_id or nid
            outcome.logs.append(NodeLogEntry(nid, node.type, label, "failed", e.message, error=e.to_dict(),
                                             duration_ms=int((time.perf_counter() - t0) * 1000)))
            outcome.status = "failed"
            outcome.error = {**e.to_dict(), "node_label": label}
            return
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001 - unexpected bug: never leak a stack trace to the user
            log.exception("Block %s (%s) crashed", nid, node.type)
            err = friendly("internal", f"{type(e).__name__}: {e}", node_id=nid)
            outcome.logs.append(NodeLogEntry(nid, node.type, label, "failed", err.message, error=err.to_dict()))
            outcome.status = "failed"
            outcome.error = {**err.to_dict(), "node_label": label}
            return
        ms = int((time.perf_counter() - t0) * 1000)
        ctx.vars.update(result.vars)
        if result.text:
            ctx.vars["previous"] = result.text
        branches[nid] = result.branch

        if result.pause is not None:
            outcome.logs.append(NodeLogEntry(nid, node.type, label, "paused", result.message, duration_ms=ms))
            outcome.status = "waiting_approval"
            outcome.reply = result.pause["waiting_reply"]
            outcome.pause_info = {"node_id": nid, "summary": result.pause["summary"]}
            branches[nid] = None
            outcome.paused_state = {
                "vars": dict(ctx.vars), "sources": list(ctx.sources), "ai_calls": ctx.ai_calls,
                "branches": branches, "next_index": idx + 1, "paused_node": nid,
                "rejected_reply": result.pause["rejected_reply"],
            }
            return

        outcome.logs.append(NodeLogEntry(nid, node.type, label, "succeeded", result.message,
                                         output_preview=(result.text or "")[:500], duration_ms=ms))
        if result.reply is not None:
            outcome.reply = result.reply

    if outcome.reply is None:
        outcome.status = "failed"
        outcome.error = FriendlyError(
            "no_reply", "Your agent finished without reaching an Output block, so it had nothing to say.",
            details="The path taken through Conditions didn't end in an Output block.").to_dict()
    else:
        outcome.status = "succeeded"


def summarize_usage(ctx: RunContext) -> dict[str, Any]:
    return {
        "prompt_tokens": sum(u.prompt_tokens for u in ctx.usage),
        "completion_tokens": sum(u.completion_tokens for u in ctx.usage),
        "cost_usd": round(sum(u.cost_usd for u in ctx.usage), 6),
        "exact": all(u.exact for u in ctx.usage),
        "ai_calls": ctx.ai_calls,
    }
