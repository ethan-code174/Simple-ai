import type { Edge, Node } from "@xyflow/react";
import type { WorkflowSpec } from "@/types";

export type BlockData = { blockType: string; label: string; config: Record<string, any> };
export type BlockNode = Node<BlockData, "block">;

export function specToFlow(spec: WorkflowSpec): { nodes: BlockNode[]; edges: Edge[] } {
  return {
    nodes: spec.nodes.map((n) => ({
      id: n.id,
      type: "block",
      position: n.position ?? { x: 0, y: 0 },
      data: { blockType: n.type, label: n.label, config: n.config ?? {} },
    })),
    edges: spec.edges.map((e) => flowEdge(e.id, e.source, e.target, e.source_handle)),
  };
}

export function flowEdge(id: string, source: string, target: string, handle: string | null | undefined): Edge {
  const h = handle && handle !== "out" ? handle : null;
  return {
    id,
    source,
    target,
    sourceHandle: h ?? "out",
    type: "flow",
    interactionWidth: 24,
    label: h === "true" ? "Yes" : h === "false" ? "No" : undefined,
    animated: false,
  };
}

export function flowToSpec(nodes: BlockNode[], edges: Edge[]): WorkflowSpec {
  return {
    schema_version: 1,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.blockType,
      label: n.data.label,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      config: n.data.config,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      source_handle: e.sourceHandle && e.sourceHandle !== "out" ? e.sourceHandle : null,
    })),
  };
}

/** Default settings for a new block. AI Model blocks get their own reply name (ai_response, ai_response_2, …)
 *  so several agents in one workflow don't overwrite each other. */
export function freshConfig(type: string, defaults: Record<string, any>, nodes: BlockNode[]): Record<string, any> {
  const cfg = { ...defaults };
  if (type === "ai_model") {
    const used = new Set(nodes.filter((n) => n.data.blockType === "ai_model").map((n) => n.data.config.output_variable ?? "ai_response"));
    let name = "ai_response";
    for (let i = 2; used.has(name); i++) name = `ai_response_${i}`;
    cfg.output_variable = name;
  }
  return cfg;
}

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/** True if `to` can be reached from `from` following edges (used to block cycles). */
export function reaches(edges: { source: string; target: string }[], from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === to) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const e of edges) if (e.source === n) stack.push(e.target);
  }
  return false;
}
