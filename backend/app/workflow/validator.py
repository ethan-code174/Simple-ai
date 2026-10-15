"""Graph validation. Never trust workflow JSON from a browser or the Architect without this."""
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from app.workflow.blocks import BLOCKS, Issue, parse_block_config
from app.workflow.spec import WorkflowSpec


@dataclass
class ValidationReport:
    spec: WorkflowSpec | None
    issues: list[Issue] = field(default_factory=list)
    order: list[str] = field(default_factory=list)  # deterministic execution order
    configs: dict[str, Any] = field(default_factory=dict)
    available_vars: dict[str, list[str]] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not any(i.severity == "error" for i in self.issues)

    def to_dict(self) -> dict:
        return {"ok": self.ok, "issues": [i.model_dump() for i in self.issues],
                "available_vars": self.available_vars}


def topo_order(node_ids: list[str], edges: list[tuple[str, str]]) -> list[str] | None:
    """Kahn's algorithm with ties broken by original node order -> deterministic. None if there's a cycle."""
    index = {n: i for i, n in enumerate(node_ids)}
    indeg = {n: 0 for n in node_ids}
    out = defaultdict(list)
    for s, t in edges:
        out[s].append(t)
        indeg[t] += 1
    ready = sorted([n for n in node_ids if indeg[n] == 0], key=index.get)
    order: list[str] = []
    while ready:
        n = ready.pop(0)
        order.append(n)
        for t in out[n]:
            indeg[t] -= 1
            if indeg[t] == 0:
                ready.append(t)
                ready.sort(key=index.get)
    return order if len(order) == len(node_ids) else None


def validate_workflow(raw: dict | WorkflowSpec, *, max_nodes: int = 50, max_edges: int = 100,
                      provider_ids: set[str] | None = None, implemented_providers: set[str] | None = None,
                      max_ai_calls: int = 5) -> ValidationReport:
    E = lambda code, msg, **kw: Issue(severity="error", code=code, message=msg, **kw)  # noqa: E731
    W = lambda code, msg, **kw: Issue(severity="warning", code=code, message=msg, **kw)  # noqa: E731

    try:
        spec = raw if isinstance(raw, WorkflowSpec) else WorkflowSpec.model_validate(raw)
    except ValidationError as e:
        return ValidationReport(None, [E("invalid_spec", f"The workflow file is malformed: {e.errors()[0]['msg']}")])

    rep = ValidationReport(spec)
    issues = rep.issues
    if len(spec.nodes) > max_nodes:
        issues.append(E("too_many_nodes", f"Workflows can have at most {max_nodes} blocks."))
    if len(spec.edges) > max_edges:
        issues.append(E("too_many_edges", f"Workflows can have at most {max_edges} connections."))
    if not spec.nodes:
        issues.append(E("empty", "Your workflow is empty. Add an Input, a Prompt, an AI Model and an Output block."))
        return rep

    ids = [n.id for n in spec.nodes]
    if len(set(ids)) != len(ids):
        issues.append(E("duplicate_node_id", "Two blocks share the same ID."))
        return rep
    nodes = {n.id: n for n in spec.nodes}

    # Blocks and their settings
    for n in spec.nodes:
        block = BLOCKS.get(n.type)
        if block is None:
            issues.append(E("unknown_block", f"“{n.label or n.type}” is not a block AI Factory can run.", node_id=n.id))
            continue
        cfg, cfg_issues = parse_block_config(block, n.config, n.id)
        issues.extend(cfg_issues)
        if cfg is not None:
            rep.configs[n.id] = cfg
            if n.type == "ai_model" and provider_ids is not None:
                if cfg.provider not in provider_ids:
                    issues.append(E("unknown_provider", f"The AI provider “{cfg.provider}” doesn't exist.", node_id=n.id))
                elif implemented_providers is not None and cfg.provider not in implemented_providers:
                    issues.append(E("provider_not_enabled",
                                    "This AI provider isn't available in this version. Choose a local model.",
                                    node_id=n.id))
    if any(i.code == "unknown_block" for i in issues):
        return rep

    # Edges
    valid_edges = []
    seen_pairs = set()
    edge_ids = set()
    for e in spec.edges:
        if e.id in edge_ids:
            issues.append(E("duplicate_edge_id", "Two connections share the same ID.", edge_id=e.id))
            continue
        edge_ids.add(e.id)
        if e.source not in nodes or e.target not in nodes:
            issues.append(E("dangling_edge", "A connection points to a block that no longer exists.", edge_id=e.id))
            continue
        if e.source == e.target:
            issues.append(E("self_loop", "A block can't connect to itself.", edge_id=e.id, node_id=e.source))
            continue
        src_block, tgt_block = BLOCKS[nodes[e.source].type], BLOCKS[nodes[e.target].type]
        if not src_block.out_handles:
            issues.append(E("output_has_outgoing", "Output blocks are the end of the line and can't connect onward.",
                            edge_id=e.id, node_id=e.source))
            continue
        if not tgt_block.accepts_input:
            issues.append(E("input_has_incoming", "Nothing can connect into an Input block; it's where messages start.",
                            edge_id=e.id, node_id=e.target))
            continue
        handle = e.source_handle or "out"
        if handle not in src_block.out_handles:
            if src_block.out_handles == ["true", "false"]:
                issues.append(E("condition_handle", "Connections from a Condition must come from its Yes or No side.",
                                edge_id=e.id, node_id=e.source))
            else:
                issues.append(E("bad_handle", "This connection uses a connector the block doesn't have.",
                                edge_id=e.id, node_id=e.source))
            continue
        pair = (e.source, handle, e.target)
        if pair in seen_pairs:
            issues.append(W("duplicate_edge", "These two blocks are connected twice.", edge_id=e.id))
            continue
        seen_pairs.add(pair)
        valid_edges.append(e)

    inputs = [n.id for n in spec.nodes if n.type == "input"]
    outputs = [n.id for n in spec.nodes if n.type == "output"]
    if not inputs:
        issues.append(E("no_input", "Add an Input block so your agent can receive messages."))
    if not outputs:
        issues.append(E("no_output", "Add an Output block so your agent can reply."))

    order = topo_order(ids, [(e.source, e.target) for e in valid_edges])
    if order is None:
        issues.append(E("cycle", "Your blocks are connected in a loop. Workflows must flow in one direction."))
        return rep
    rep.order = order

    incoming = defaultdict(list)
    outgoing = defaultdict(list)
    for e in valid_edges:
        incoming[e.target].append(e)
        outgoing[e.source].append(e)

    # Reachability from inputs
    reach = set(inputs)
    dq = deque(inputs)
    while dq:
        n = dq.popleft()
        for e in outgoing[n]:
            if e.target not in reach:
                reach.add(e.target)
                dq.append(e.target)
    for n in spec.nodes:
        if n.id not in reach:
            if n.type == "output":
                issues.append(E("output_unreachable", "This Output block isn't connected to the rest of the workflow, "
                                "so it will never send a reply.", node_id=n.id))
            else:
                issues.append(W("unreachable", "This block isn't connected to an Input, so it will never run.",
                                node_id=n.id))
    if outputs and not any(o in reach for o in outputs) and not any(i.code == "output_unreachable" for i in issues):
        issues.append(E("output_unreachable", "No Output block is connected to an Input."))

    for n in spec.nodes:
        if n.type == "condition":
            handles = {e.source_handle for e in outgoing[n.id]}
            if not handles:
                issues.append(E("condition_dead_end", "This Condition isn't connected to anything after it.", node_id=n.id))
            elif len(handles) < 2:
                missing = "No" if "true" in handles else "Yes"
                issues.append(W("condition_one_branch",
                                f"This Condition's “{missing}” path isn't connected, so those messages get no reply.",
                                node_id=n.id))
        elif n.type not in ("output",) and n.id in reach and not outgoing[n.id] and n.type != "human_approval":
            issues.append(W("dead_end", "Nothing happens after this block. Connect it to the next step.", node_id=n.id))

    # Variable flow: what's available at each node = everything produced by its ancestors.
    produced_by = {nid: (BLOCKS[nodes[nid].type].produces(rep.configs[nid]) if nid in rep.configs else [])
                   for nid in ids}
    available: dict[str, set[str]] = {}
    for nid in order:
        avail = {"previous"}
        for e in incoming[nid]:
            avail |= available[e.source] | set(produced_by[e.source])
        available[nid] = avail
        rep.available_vars[nid] = sorted(avail)
        if nid not in rep.configs or nid not in reach:
            continue
        block = BLOCKS[nodes[nid].type]
        required, optional = block.reads(rep.configs[nid])
        for v in required:
            if v not in avail:
                issues.append(E("missing_variable",
                                f"This block uses “{v}”, but no block before it creates that value.", node_id=nid))
        for v in optional:
            if v not in avail:
                issues.append(W("unknown_template_variable",
                                f"{{{{{v}}}}} isn't created by any earlier block, so it will be empty.", node_id=nid))
        if nodes[nid].type == "ai_model" and "system_prompt" not in avail:
            issues.append(W("no_prompt", "There's no Prompt block before this AI Model, so it gets the raw message "
                            "with no instructions.", node_id=nid))

    ai_nodes = sum(1 for n in spec.nodes if n.type == "ai_model")
    if ai_nodes > max_ai_calls:
        issues.append(E("too_many_ai_blocks", f"A workflow can use at most {max_ai_calls} AI Model blocks."))
    return rep
