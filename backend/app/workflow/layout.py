"""Simple left-to-right layered layout (longest-path layering)."""
from collections import defaultdict

from app.workflow.validator import topo_order

X_GAP, Y_GAP = 300, 170


def auto_layout(spec: dict) -> dict:
    nodes = spec.get("nodes", [])
    ids = [n["id"] for n in nodes]
    edges = [(e["source"], e["target"]) for e in spec.get("edges", []) if e["source"] in ids and e["target"] in ids]
    order = topo_order(ids, edges) or ids
    layer = {n: 0 for n in ids}
    for n in order:
        for s, t in edges:
            if s == n:
                layer[t] = max(layer[t], layer[n] + 1)
    by_layer: dict[int, list[str]] = defaultdict(list)
    for n in order:
        by_layer[layer[n]].append(n)
    pos = {}
    for lx, members in by_layer.items():
        total = (len(members) - 1) * Y_GAP
        for i, n in enumerate(members):
            pos[n] = {"x": lx * X_GAP, "y": i * Y_GAP - total / 2}
    out = dict(spec)
    out["nodes"] = [{**n, "position": pos.get(n["id"], n.get("position", {"x": 0, "y": 0}))} for n in nodes]
    return out
