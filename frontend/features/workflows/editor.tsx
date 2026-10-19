"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type FinalConnectionState, type IsValidConnection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle, ArrowLeft, BookOpen, ChevronDown, ChevronUp, CircleCheck, CloudOff, FlaskConical, Globe, History, LayoutGrid,
  Loader2, Maximize, MessagesSquare, Redo2, Save, SlidersHorizontal, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner, Tabs } from "@/components/ui/misc";
import { ArchitectChat } from "@/features/architect/architect-chat";
import { PublishDialog } from "@/features/agents/publish-dialog";
import { TestsPanel, VersionsPanel } from "@/features/agents/side-panels";
import { KnowledgePanel } from "@/features/knowledge/knowledge-panel";
import { TestChat } from "@/features/playground/test-chat";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { iconFor } from "@/lib/icons";
import { useToast } from "@/lib/toast";
import { cn, ms } from "@/lib/utils";
import type { AgentDetail, BlockDef, Execution, Issue, NodeLog, Provider, Validation, WorkflowSpec } from "@/types";
import { BlockLibrary } from "./block-library";
import { BlockNodeComponent } from "./block-node";
import { FlowEdge } from "./flow-edge";
import { flowEdge, flowToSpec, freshConfig, newId, reaches, specToFlow, type BlockNode } from "./convert";
import { EditorContext } from "./editor-context";
import { SettingsPanel } from "./settings-panel";

const nodeTypes = { block: BlockNodeComponent };
const edgeTypes = { flow: FlowEdge };
type RightTab = "block" | "architect" | "knowledge" | "tests" | "versions";
type BottomTab = "test" | "log" | "problems";

export function WorkflowEditor({ agentId, isNew }: { agentId: string; isNew: boolean }) {
  return (
    <ReactFlowProvider>
      <EditorInner agentId={agentId} isNew={isNew} />
    </ReactFlowProvider>
  );
}

function EditorInner({ agentId, isNew }: { agentId: string; isNew: boolean }) {
  const toast = useToast();
  const rf = useReactFlow();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [blocks, setBlocks] = useState<BlockDef[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<BlockNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "pending" | "error">("saved");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>(isNew ? "architect" : "block");
  const [bottomTab, setBottomTab] = useState<BottomTab>("test");
  const [bottomOpen, setBottomOpen] = useState(true);
  const [lastRun, setLastRun] = useState<Execution | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionsKey, setVersionsKey] = useState(0);
  const [intro, setIntro] = useState<string | null>(null);
  const [, setHistoryTick] = useState(0);
  // Shown when a connection is dragged onto empty canvas: pick a block to add there, already connected.
  // `beside`: opened from a block's + button, so the new block goes next to that block rather than at the pointer.
  const [picker, setPicker] = useState<{ x: number; y: number; source: string; handle: string; beside?: boolean } | null>(null);

  const { theme } = useTheme();
  const selectedRef = useRef<string | null>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const hist = useRef<{ past: WorkflowSpec[]; future: WorkflowSpec[]; present: WorkflowSpec | null; coalesce: { key: string; t: number } | null }>({ past: [], future: [], present: null, coalesce: null });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromise = useRef<Promise<void> | null>(null);

  // ---------------------------------------------------------------- load
  useEffect(() => {
    try {
      const t = sessionStorage.getItem(`aif_explain_${agentId}`);
      if (t) { setIntro(t); sessionStorage.removeItem(`aif_explain_${agentId}`); }
    } catch {}
    Promise.all([api<AgentDetail>(`/api/agents/${agentId}`), api<BlockDef[]>("/api/blocks"), api<Provider[]>("/api/providers")])
      .then(([a, b, p]) => {
        setAgent(a);
        setBlocks(b);
        setProviders(p);
        setValidation(a.validation);
        const f = specToFlow(a.spec);
        setNodes(f.nodes);
        setEdges(f.edges);
        hist.current.present = a.spec;
        setTimeout(() => rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1 }), 50);
      })
      .catch((e) => setLoadError(e.message));
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- saving
  const doSave = useCallback(async () => {
    const spec = hist.current.present;
    if (!spec) return;
    setSaveState("saving");
    try {
      const r = await api<{ validation: Validation }>(`/api/agents/${agentId}/workflow`, { method: "PUT", json: { spec } });
      setValidation(r.validation);
      setSaveState(hist.current.present === spec ? "saved" : "pending");
    } catch (e: any) {
      setSaveState("error");
      toast("error", `Couldn't save: ${e.message}`);
    }
  }, [agentId, toast]);

  const scheduleSave = useCallback(() => {
    setSaveState("pending");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { savePromise.current = doSave(); }, 700);
  }, [doSave]);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      savePromise.current = doSave();
    }
    if (savePromise.current) await savePromise.current;
  }, [doSave]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (saveTimer.current) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // ---------------------------------------------------------------- history
  const commit = useCallback((nextNodes: BlockNode[], nextEdges: Edge[], coalesceKey?: string) => {
    setNodes(nextNodes);
    setEdges(nextEdges);
    const h = hist.current;
    const spec = flowToSpec(nextNodes, nextEdges);
    const now = Date.now();
    const coalesce = coalesceKey && h.coalesce?.key === coalesceKey && now - h.coalesce.t < 1200;
    if (!coalesce && h.present) {
      h.past.push(h.present);
      if (h.past.length > 100) h.past.shift();
    }
    h.future = [];
    h.present = spec;
    h.coalesce = coalesceKey ? { key: coalesceKey, t: now } : null;
    setHistoryTick((t) => t + 1);
    scheduleSave();
  }, [setNodes, setEdges, scheduleSave]);

  const applySpec = useCallback((spec: WorkflowSpec) => {
    const f = specToFlow(spec);
    setNodes(f.nodes.map((n) => ({ ...n, selected: n.id === selectedId })));
    setEdges(f.edges);
  }, [setNodes, setEdges, selectedId]);

  const undo = useCallback(() => {
    const h = hist.current;
    if (!h.past.length || !h.present) return;
    h.future.unshift(h.present);
    h.present = h.past.pop()!;
    h.coalesce = null;
    applySpec(h.present);
    setHistoryTick((t) => t + 1);
    scheduleSave();
  }, [applySpec, scheduleSave]);

  const redo = useCallback(() => {
    const h = hist.current;
    if (!h.future.length || !h.present) return;
    h.past.push(h.present);
    h.present = h.future.shift()!;
    applySpec(h.present);
    setHistoryTick((t) => t + 1);
    scheduleSave();
  }, [applySpec, scheduleSave]);

  // ---------------------------------------------------------------- editing operations
  const blockMap = useMemo(() => Object.fromEntries(blocks.map((b) => [b.type, b])), [blocks]);

  /** Why source --handle--> target can't be connected, or null if it can. `ignoreEdge` is the connection
   *  being moved, which shouldn't count against its own new position. */
  const connectionProblem = useCallback((source: string, handle: string, target: string, ignoreEdge?: string): string | null => {
    if (source === target) return "A block can't connect to itself.";
    const src = nodesRef.current.find((n) => n.id === source);
    const tgt = nodesRef.current.find((n) => n.id === target);
    if (!src || !tgt) return "That step was deleted.";
    if (!blockMap[tgt.data.blockType]?.accepts_input) return "Nothing can go into the Incoming message step. It's always first.";
    if (!blockMap[src.data.blockType]?.out_handles.length) return "The Reply step is always last, so nothing can come after it.";
    if (!blockMap[src.data.blockType].out_handles.includes(handle)) return "Start the line from one of the dots on the right side of the step.";
    const others = edgesRef.current.filter((e) => e.id !== ignoreEdge);
    if (others.some((e) => e.source === source && e.target === target && (e.sourceHandle ?? "out") === handle)) return "These two steps are already joined.";
    if (reaches(others, target, source)) return "That would make the steps go round in a circle. Steps must go in one direction.";
    return null;
  }, [blockMap]);
  const canConnect = useCallback((source: string, handle: string, target: string) => !connectionProblem(source, handle, target), [connectionProblem]);

  const connect = useCallback((source: string, handle: string, target: string) => {
    if (!canConnect(source, handle, target)) return false;
    commit(nodesRef.current, [...edgesRef.current, flowEdge(newId("e"), source, target, handle)]);
    return true;
  }, [canConnect, commit]);

  /** Add a block. With `from`, it's connected after that block. Clicking a library block while a block is
   *  selected places the new one to its right and connects them, so beginners rarely need to drag wires. */
  const addBlock = useCallback((type: string, position?: { x: number; y: number }, from?: { source: string; handle: string }) => {
    const def = blockMap[type];
    if (!def) return;
    let pos = position;
    let link = from;
    const sel = nodesRef.current.find((n) => n.id === selectedRef.current);
    if (!pos && !link && sel && def.accepts_input) {
      const handles = blockMap[sel.data.blockType]?.out_handles ?? [];
      if (handles.length) {
        const free = handles.find((h) => !edgesRef.current.some((e) => e.source === sel.id && (e.sourceHandle ?? "out") === h));
        link = { source: sel.id, handle: free ?? handles[0] };
      }
    }
    if (!pos && link) {
      const src = nodesRef.current.find((n) => n.id === link!.source);
      if (src) {
        const p = { x: src.position.x + 300, y: src.position.y };
        while (nodesRef.current.some((n) => Math.abs(n.position.x - p.x) < 230 && Math.abs(n.position.y - p.y) < 120)) p.y += 140;
        pos = p;
      }
    }
    if (!pos) {
      const el = document.querySelector(".react-flow");
      const r = el?.getBoundingClientRect();
      pos = rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) / 2 - 115, y: (r?.top ?? 0) + (r?.height ?? 600) / 2 - 50 });
    }
    const id = newId(type);
    const node: BlockNode = { id, type: "block", position: pos, data: { blockType: type, label: def.label, config: freshConfig(type, def.defaults, nodesRef.current) }, selected: true };
    const linked = !!link && def.accepts_input;
    const nextEdges = linked ? [...edgesRef.current, flowEdge(newId("e"), link!.source, id, link!.handle)] : edgesRef.current;
    const srcLabel = linked ? nodesRef.current.find((n) => n.id === link!.source)?.data.label : null;
    commit([...nodesRef.current.map((n) => ({ ...n, selected: false })), node], nextEdges);
    selectedRef.current = id;
    setSelectedId(id);
    setRightTab("block");
    if (linked) toast("ok", `Added ${def.label} and connected it after “${srcLabel}”`);
  }, [blockMap, commit, rf, toast]);

  // Letting go of a dragged connection: over a block's body -> connect to it; on empty canvas -> block picker.
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode || state.fromHandle?.type !== "source") return;
    const pt = "changedTouches" in event ? event.changedTouches[0] : event;
    const source = state.fromNode.id;
    const handle = state.fromHandle.id ?? "out";
    const target = document.elementFromPoint(pt.clientX, pt.clientY)?.closest(".react-flow__node")?.getAttribute("data-id");
    if (target) {
      const problem = target !== source && connectionProblem(source, handle, target);
      if (problem) toast("error", problem);
      else if (target !== source) connect(source, handle, target);
      return;
    }
    if ((event.target as Element | null)?.closest?.(".react-flow__pane")) setPicker({ x: pt.clientX, y: pt.clientY, source, handle });
  }, [connect, connectionProblem, toast]);

  // ---------------------------------------------------------------- moving an existing connection
  // Grab either end of a line and drop it on another block to re-route it; drop it on empty canvas to remove it.
  const reconnecting = useRef<{ id: string; done: boolean } | null>(null);

  const moveEdge = useCallback((old: Edge, source: string, handle: string, target: string) => {
    const problem = connectionProblem(source, handle, target, old.id);
    if (problem) { toast("error", problem); return; }
    commit(nodesRef.current, edgesRef.current.map((e) => (e.id === old.id ? flowEdge(e.id, source, target, handle) : e)));
  }, [commit, connectionProblem, toast]);

  const onReconnectStart = useCallback((_: unknown, edge: Edge) => { reconnecting.current = { id: edge.id, done: false }; }, []);

  const onReconnect = useCallback((old: Edge, c: Connection) => {
    if (reconnecting.current) reconnecting.current.done = true;
    moveEdge(old, c.source, c.sourceHandle ?? "out", c.target);
  }, [moveEdge]);

  const onReconnectEnd = useCallback((event: MouseEvent | TouchEvent, edge: Edge, _h: unknown, state: FinalConnectionState) => {
    const r = reconnecting.current;
    reconnecting.current = null;
    if (!r || r.done) return;
    // The end that stayed put is `fromNode`; the other end was dropped at the pointer.
    const pt = "changedTouches" in event ? event.changedTouches[0] : event;
    const over = document.elementFromPoint(pt.clientX, pt.clientY)?.closest(".react-flow__node")?.getAttribute("data-id");
    const fixed = state.fromNode?.id;
    const movingTarget = state.fromHandle?.type === "source";
    if (over && fixed && over !== (movingTarget ? edge.target : edge.source)) {
      if (movingTarget) moveEdge(edge, edge.source, edge.sourceHandle ?? "out", over);
      else {
        const outs = blockMap[nodesRef.current.find((n) => n.id === over)?.data.blockType ?? ""]?.out_handles ?? [];
        const free = outs.find((h) => !edgesRef.current.some((e) => e.source === over && (e.sourceHandle ?? "out") === h));
        moveEdge(edge, over, free ?? outs[0] ?? "out", edge.target);
      }
    } else if (!over) {
      commit(nodesRef.current, edgesRef.current.filter((e) => e.id !== edge.id));
      toast("ok", "Line removed. Press Undo to bring it back.");
    }
  }, [blockMap, commit, moveEdge, toast]);

  const updateNode =useCallback((id: string, patch: { label?: string; config?: Record<string, any> }) => {
    commit(nodesRef.current.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...(patch.label !== undefined ? { label: patch.label } : {}), ...(patch.config ? { config: patch.config } : {}) } } : n)),
      edgesRef.current, `edit:${id}:${patch.label !== undefined ? "label" : Object.keys(patch.config ?? {}).join()}`);
  }, [commit]);

  const deleteNodes = useCallback((ids: string[], edgeIds: string[] = []) => {
    if (!ids.length && !edgeIds.length) return;
    commit(nodesRef.current.filter((n) => !ids.includes(n.id)),
      edgesRef.current.filter((e) => !ids.includes(e.source) && !ids.includes(e.target) && !edgeIds.includes(e.id)));
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
  }, [commit, selectedId]);

  const duplicateNode = useCallback((id: string) => {
    const src = nodesRef.current.find((n) => n.id === id);
    if (!src) return;
    const nid = newId(src.data.blockType);
    const config = src.data.blockType === "ai_model"
      ? { ...src.data.config, output_variable: freshConfig("ai_model", {}, nodesRef.current).output_variable } : { ...src.data.config };
    const copy: BlockNode = { ...src, id: nid, selected: true, position: { x: src.position.x + 40, y: src.position.y + 60 }, data: { ...src.data, label: `${src.data.label} copy`.slice(0, 80), config } };
    commit([...nodesRef.current.map((n) => ({ ...n, selected: false })), copy], edgesRef.current);
    setSelectedId(nid);
  }, [commit]);

  const isValidConnection: IsValidConnection = useCallback(
    (c) => !!c.source && !!c.target && !connectionProblem(c.source, c.sourceHandle ?? "out", c.target, reconnecting.current?.id),
    [connectionProblem]);

  const onConnect = useCallback((c: Connection) => { connect(c.source, c.sourceHandle ?? "out", c.target); }, [connect]);

  const removeEdge = useCallback((id: string) => {
    commit(nodesRef.current, edgesRef.current.filter((e) => e.id !== id));
  }, [commit]);

  const autoLayout = async () => {
    try {
      const spec = await api<WorkflowSpec>("/api/workflows/layout", { method: "POST", json: { spec: flowToSpec(nodesRef.current, edgesRef.current) } });
      const pos = Object.fromEntries(spec.nodes.map((n) => [n.id, n.position]));
      commit(nodesRef.current.map((n) => ({ ...n, position: pos[n.id] ?? n.position })), edgesRef.current);
      setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 30);
    } catch (e: any) { toast("error", e.message); }
  };

  const saveVersion = useCallback(async () => {
    await flushSave();
    try {
      const r = await api<{ version: number }>(`/api/agents/${agentId}/versions`, { method: "POST", json: { note: "Saved from editor" } });
      toast("ok", `Saved as version ${r.version}`);
      setVersionsKey((k) => k + 1);
    } catch (e: any) { toast("error", e.message); }
  }, [agentId, flushSave, toast]);

  const restore = async (v: number) => {
    await flushSave();
    const a = await api<AgentDetail>(`/api/agents/${agentId}/versions/${v}/restore`, { method: "POST" });
    const f = specToFlow(a.spec);
    commit(f.nodes, f.edges);
    setValidation(a.validation);
    setVersionsKey((k) => k + 1);
    toast("ok", `Restored version ${v}`);
  };

  const renameAgent = async (name: string) => {
    if (!agent || !name.trim() || name === agent.name) return;
    try { await api(`/api/agents/${agentId}`, { method: "PATCH", json: { name } }); setAgent({ ...agent, name }); }
    catch (e: any) { toast("error", e.message); }
  };

  // ---------------------------------------------------------------- keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveVersion(); }
      else if (mod && e.key.toLowerCase() === "d" && selectedId) { e.preventDefault(); duplicateNode(selectedId); }
      else if (e.key === "Delete" || e.key === "Backspace") {
        const ids = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
        const eids = edgesRef.current.filter((x) => x.selected).map((x) => x.id);
        if (ids.length || eids.length) { e.preventDefault(); deleteNodes(ids, eids); }
      } else if (e.key.toLowerCase() === "f" && !mod) rf.fitView({ padding: 0.2, duration: 300 });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo, redo, saveVersion, duplicateNode, deleteNodes, selectedId, rf]);

  // ---------------------------------------------------------------- derived
  const issuesByNode = useMemo(() => {
    const m: Record<string, Issue[]> = {};
    for (const i of validation?.issues ?? []) if (i.node_id) (m[i.node_id] ??= []).push(i);
    return m;
  }, [validation]);
  const runByNode = useMemo(() => {
    const m: Record<string, NodeLog> = {};
    for (const l of lastRun?.logs ?? []) m[l.node_id] = l;
    return m;
  }, [lastRun]);
  const addAfter = useCallback((source: string, handle: string, at: { x: number; y: number }) => setPicker({ ...at, source, handle, beside: true }), []);
  const ctx = useMemo(() => ({ blocks: blockMap, providers, issuesByNode, runByNode, availableVars: validation?.available_vars ?? {}, addAfter, removeEdge }), [blockMap, providers, issuesByNode, runByNode, validation, addAfter, removeEdge]);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const errorCount = validation?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warnCount = validation?.issues.filter((i) => i.severity === "warning").length ?? 0;
  const hasKnowledge = nodes.some((n) => n.data.blockType === "knowledge_search");
  const getSpec = useCallback(() => flowToSpec(nodesRef.current, edgesRef.current), []);
  const ollama = providers.find((p) => p.id === "ollama");
  const usesOllama = nodes.some((n) => n.data.blockType === "ai_model" && n.data.config.provider === "ollama");

  if (loadError) return <div className="grid h-screen place-items-center text-center"><div><p className="text-bad">{loadError}</p><Link href="/agents" className="mt-3 inline-block text-accent">Back to my AIs</Link></div></div>;
  if (!agent) return <div className="grid h-screen place-items-center"><Spinner className="h-6 w-6 text-accent" /></div>;

  return (
    <EditorContext.Provider value={ctx}>
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
          <Link href="/agents"><Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-5" aria-label="Back to my AIs"><ArrowLeft /></Button></Link>
          <input aria-label="AI name" defaultValue={agent.name} onBlur={(e) => renameAgent(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="w-56 truncate rounded-md bg-transparent px-2 py-1 font-semibold hover:bg-line/40 focus:bg-line/40 focus:outline-none" maxLength={120} />
          {agent.status === "published" ? <Badge tone="ok"><Globe className="h-3 w-3" />Shared</Badge> : <Badge>Not shared yet</Badge>}
          <span className="ml-1 flex items-center gap-1.5 text-xs text-muted" data-testid="save-state">
            {saveState === "saving" || saveState === "pending" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : saveState === "error" ? <><CloudOff className="h-3.5 w-3.5 text-bad" />Not saved</> : <><CircleCheck className="h-3.5 w-3.5 text-ok" />Saved</>}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-5" onClick={undo} disabled={!hist.current.past.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 /></Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-5" onClick={redo} disabled={!hist.current.future.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 /></Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-5" onClick={autoLayout} title="Tidy up" aria-label="Tidy up"><LayoutGrid /></Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-5" onClick={() => rf.fitView({ padding: 0.2, duration: 300 })} title="Fit to screen (F)" aria-label="Fit to screen"><Maximize /></Button>
            <span className="mx-1 h-5 w-px bg-line" />
            <button onClick={() => { setBottomOpen(true); setBottomTab("problems"); }} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs", errorCount ? "text-bad" : warnCount ? "text-warn" : "text-ok")} data-testid="problems-badge">
              {errorCount ? <><AlertTriangle className="h-3.5 w-3.5" />{errorCount} thing{errorCount > 1 ? "s" : ""} to fix</> : warnCount ? <><AlertTriangle className="h-3.5 w-3.5" />{warnCount} warning{warnCount > 1 ? "s" : ""}</> : <><CircleCheck className="h-3.5 w-3.5" />Ready to run</>}
            </button>
            <Button variant="secondary" onClick={saveVersion} title="Save a copy you can go back to (Ctrl+S)"><Save />Save a copy</Button>
            <Button variant="secondary" onClick={() => { setBottomOpen(true); setBottomTab("test"); }}><FlaskConical />Try it</Button>
            <Button onClick={async () => { await flushSave(); setPublishOpen(true); }} data-testid="publish-open"><Globe />Share</Button>
          </div>
        </header>

        {usesOllama && ollama && !ollama.available && (
          <div className="flex flex-wrap items-center gap-3 border-b border-warn/40 bg-warn/10 px-4 py-2 text-base">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warn" />
            <span className="min-w-0 flex-1">Your AI can't think yet: the free AI program (Ollama) isn't on this computer. <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="underline">How to install it</a></span>
            <Button size="sm" data-testid="use-quotes" onClick={() => {
              commit(nodesRef.current.map((n) => (n.data.blockType === "ai_model" && n.data.config.provider === "ollama"
                ? { ...n, data: { ...n.data, config: { ...n.data.config, provider: "quotes", model: "quote-finder" } } } : n)), edgesRef.current);
              toast("ok", "Done. Your AI now answers by quoting your documents. Press Undo to go back.");
            }}>Use the no-AI option instead</Button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-64 shrink-0 overflow-x-hidden border-r border-line bg-panel/50 md:block"><BlockLibrary blocks={blocks} onAdd={addBlock} /></aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 bg-grid" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
              onDrop={(e) => {
                e.preventDefault();
                const t = e.dataTransfer.getData("application/aif-block");
                if (!t) return;
                // Dropped on top of an existing block -> place the new one after it, connected.
                const onto = (e.target as Element).closest?.(".react-flow__node")?.getAttribute("data-id");
                const outs = onto ? blockMap[nodesRef.current.find((n) => n.id === onto)?.data.blockType ?? ""]?.out_handles ?? [] : [];
                if (onto && outs.length) {
                  const free = outs.find((h) => !edgesRef.current.some((x) => x.source === onto && (x.sourceHandle ?? "out") === h));
                  addBlock(t, undefined, { source: onto, handle: free ?? outs[0] });
                } else addBlock(t, rf.screenToFlowPosition({ x: e.clientX - 115, y: e.clientY - 40 }));
              }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectEnd={onConnectEnd}
                onReconnect={onReconnect}
                onReconnectStart={onReconnectStart}
                onReconnectEnd={onReconnectEnd}
                reconnectRadius={12}
                isValidConnection={isValidConnection}
                connectionRadius={45}
                onPaneClick={() => setPicker(null)}
                onNodeDragStop={() => commit(nodesRef.current, edgesRef.current, "move")}
                onSelectionChange={({ nodes: sel }) => {
                  const id = sel.length === 1 ? sel[0].id : null;
                  if (id !== selectedRef.current) { selectedRef.current = id; setSelectedId(id); if (id) setRightTab("block"); }
                }}
                colorMode={theme}
                deleteKeyCode={null}
                minZoom={0.2}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{ type: "flow", interactionWidth: 24 }}
              >
                <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgb(var(--line))" />
                <Controls showInteractive={false} position="bottom-left" />
                <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => blockMap[(n.data as any)?.blockType]?.color ?? "#888"} />
              </ReactFlow>
              {picker && (
                <ConnectPicker blocks={blocks} at={picker} onClose={() => setPicker(null)}
                  onPick={(type) => { const p = picker; setPicker(null); addBlock(type, p.beside ? undefined : rf.screenToFlowPosition({ x: p.x, y: p.y - 40 }), { source: p.source, handle: p.handle }); }} />
              )}
              {nodes.length === 0 && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-sm text-muted">
                  <div>Drag steps here from the left, or use “Ask for changes” on the right.</div>
                </div>
              )}
            </div>

            {/* Bottom panel */}
            <div className={cn("shrink-0 border-t border-line bg-panel/70", bottomOpen ? "h-[300px]" : "h-10")}>
              <div className="flex h-10 items-center gap-2 border-b border-line px-3">
                <Tabs<BottomTab> className="w-[340px]" value={bottomTab} onChange={(t) => { setBottomTab(t); setBottomOpen(true); }} tabs={[
                  { id: "test", label: "Try it" },
                  { id: "log", label: "What happened" },
                  { id: "problems", label: `To fix${errorCount + warnCount ? ` (${errorCount + warnCount})` : ""}` },
                ]} />
                <button className="ml-auto text-muted hover:text-fg" onClick={() => setBottomOpen((o) => !o)} aria-label={bottomOpen ? "Hide this panel" : "Show this panel"}>{bottomOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>
              </div>
              {bottomOpen && (
                <div className="h-[260px]">
                  <div className={bottomTab === "test" ? "h-full" : "hidden"}><TestChat agentId={agentId} beforeRun={flushSave} onRun={(r) => setLastRun(r)} /></div>
                  {bottomTab === "log" && <RunLog run={lastRun} onSelect={(id) => { setSelectedId(id); setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id }))); setRightTab("block"); }} />}
                  {bottomTab === "problems" && <Problems issues={validation?.issues ?? []} nodes={nodes} onSelect={(id) => { setSelectedId(id); setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id }))); setRightTab("block"); const n = nodesRef.current.find((x) => x.id === id); if (n) rf.setCenter(n.position.x + 115, n.position.y + 50, { zoom: 1, duration: 400 }); }} />}
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <aside className="flex w-[420px] shrink-0 flex-col border-l border-line bg-panel/50">
            {/* Panel tabs: equal-width, full-row buttons with an icon above a readable label. */}
            <div className="grid shrink-0 grid-cols-5 border-b border-line" role="tablist">
              {([
                ["block", "This step", SlidersHorizontal],
                ["architect", "Ask", MessagesSquare],
                ["knowledge", "Documents", BookOpen],
                ["tests", "Checks", FlaskConical],
                ["versions", "History", History],
              ] as const).map(([id, label, Icon]) => (
                <button key={id} role="tab" aria-selected={rightTab === id} onClick={() => setRightTab(id)}
                  className={cn("flex h-16 flex-col items-center justify-center gap-1.5 border-b-2 text-base font-medium transition-colors",
                    rightTab === id ? "border-accent bg-card text-fg" : "border-transparent text-muted hover:bg-line/40 hover:text-fg")}>
                  <Icon className="h-[18px] w-[18px]" />{label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              <div className={rightTab === "architect" ? "h-full" : "hidden"}>
                <ArchitectChat agentId={agentId} getSpec={getSpec} intro={intro ?? undefined} key={intro ?? "default"}
                  onApplied={(spec) => { const f = specToFlow(spec); commit(f.nodes, f.edges); setVersionsKey((k) => k + 1); setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 50); }} />
              </div>
              {rightTab === "block" && <SettingsPanel node={selected} onChange={updateNode} onDelete={(id) => deleteNodes([id])} onDuplicate={duplicateNode}
                nodes={nodes} edges={edges} canConnect={canConnect} onConnect={connect} onRemoveEdge={removeEdge} />}
              {rightTab === "knowledge" && <KnowledgePanel agentId={agentId} hasKnowledgeBlock={hasKnowledge} />}
              {rightTab === "tests" && <TestsPanel agentId={agentId} beforeRun={flushSave} />}
              {rightTab === "versions" && <VersionsPanel agentId={agentId} refreshKey={versionsKey} onRestore={restore} />}
            </div>
          </aside>
        </div>
      </div>
      <PublishDialog open={publishOpen} onClose={() => setPublishOpen(false)} agent={agent} validation={validation} beforePublish={flushSave}
        onUpdated={(a) => { setAgent(a); setVersionsKey((k) => k + 1); }} />
    </EditorContext.Provider>
  );
}

function ConnectPicker({ blocks, at, onPick, onClose }: { blocks: BlockDef[]; at: { x: number; y: number }; onPick: (type: string) => void; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed z-50 w-56 rounded-md border border-line bg-card p-1 shadow-lg" style={{ left: Math.min(at.x, window.innerWidth - 250), top: Math.min(at.y, window.innerHeight - 340) }} data-testid="connect-picker">
      <div className="px-2 pb-1 pt-1 text-xs text-muted">Add the next step</div>
      {blocks.filter((b) => b.accepts_input).map((b) => {
        const Icon = iconFor(b.icon);
        return (
          <button key={b.type} onClick={() => onPick(b.type)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-line/50">
            <Icon className="h-4 w-4 shrink-0" style={{ color: b.color }} />{b.label}
          </button>
        );
      })}
    </div>
  );
}

function RunLog({ run, onSelect }: { run: Execution | null; onSelect: (id: string) => void }) {
  if (!run) return <p className="p-6 text-center text-sm text-muted">Try a question to see what each step did.</p>;
  return (
    <div className="h-full overflow-y-auto p-3 text-sm">
      <div className="mb-2 text-xs text-muted">Run {run.id.slice(0, 8)} · {ms(run.duration_ms)} · {run.prompt_tokens + run.completion_tokens} tokens</div>
      <table className="w-full text-xs">
        <tbody>
          {run.logs.map((l, i) => (
            <tr key={i} className={cn("cursor-pointer border-b border-line/60 hover:bg-line/30", l.status === "skipped" && "opacity-50")} onClick={() => onSelect(l.node_id)}>
              <td className="w-6 py-1.5"><span className={l.status === "succeeded" ? "text-ok" : l.status === "failed" ? "text-bad" : l.status === "paused" ? "text-warn" : "text-muted"}>●</span></td>
              <td className="w-40 font-medium">{l.label}</td>
              <td className="text-muted">{l.message}{l.output_preview && <div className="mt-0.5 line-clamp-2 font-mono text-xs text-fg/70">{l.output_preview}</div>}{l.error?.details && <div className="mt-0.5 font-mono text-xs text-bad/80">{l.error.details}</div>}</td>
              <td className="w-16 text-right text-muted">{ms(l.duration_ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Problems({ issues, nodes, onSelect }: { issues: Issue[]; nodes: BlockNode[]; onSelect: (id: string) => void }) {
  if (!issues.length) return <p className="flex items-center justify-center gap-2 p-6 text-sm text-ok"><CircleCheck className="h-4 w-4" />Nothing to fix. Your AI is ready.</p>;
  const label = (id?: string | null) => nodes.find((n) => n.id === id)?.data.label;
  return (
    <ul className="h-full space-y-1.5 overflow-y-auto p-3">
      {issues.map((i, k) => (
        <li key={k}>
          <button disabled={!i.node_id} onClick={() => i.node_id && onSelect(i.node_id)} className={cn("flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm", i.severity === "error" ? "bg-bad/10 text-bad" : "bg-warn/10 text-warn", i.node_id && "hover:brightness-110")}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{label(i.node_id) && <b className="mr-1">{label(i.node_id)}:</b>}{i.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
