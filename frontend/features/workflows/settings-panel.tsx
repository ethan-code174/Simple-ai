"use client";

import type { Edge } from "@xyflow/react";
import { AlertTriangle, ArrowRight, Copy, Link2, MousePointerClick, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Switch, Textarea } from "@/components/ui/input";
import { iconFor } from "@/lib/icons";
import type { FieldDef } from "@/types";
import type { BlockNode } from "./convert";
import { useEditor } from "./editor-context";

type Props = {
  node: BlockNode | null;
  onChange: (id: string, patch: { label?: string; config?: Record<string, any> }) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  nodes: BlockNode[];
  edges: Edge[];
  canConnect: (source: string, handle: string, target: string) => boolean;
  onConnect: (source: string, handle: string, target: string) => boolean;
  onRemoveEdge: (id: string) => void;
};

const HANDLE_LABEL: Record<string, string> = { out: "Then go to", true: "If Yes, go to", false: "If No, go to" };

/** Connect blocks from a list instead of dragging wires on the canvas. */
function Connections({ node, nodes, edges, canConnect, onConnect, onRemoveEdge }: Omit<Props, "onChange" | "onDelete" | "onDuplicate"> & { node: BlockNode }) {
  const { blocks } = useEditor();
  const def = blocks[node.data.blockType];
  const name = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? "a deleted block";
  const incoming = edges.filter((e) => e.target === node.id);
  if (!def) return null;
  return (
    <div className="space-y-3 rounded-md border border-line p-3" data-testid="connections">
      <div className="flex items-center gap-1.5 text-xs font-medium"><Link2 className="h-3.5 w-3.5 text-muted" />Joined to</div>
      {def.accepts_input && (
        <p className="text-xs text-muted">
          {incoming.length ? <>Comes after: {incoming.map((e) => <b key={e.id} className="text-fg">{name(e.source)}</b>).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ", ", x] : [x]), [])}</> : "Nothing connects into this block yet."}
        </p>
      )}
      {def.out_handles.map((h) => {
        const outs = edges.filter((e) => e.source === node.id && (e.sourceHandle ?? "out") === h);
        const options = nodes.filter((n) => canConnect(node.id, h, n.id));
        return (
          <div key={h}>
            <Label className="mb-1">{HANDLE_LABEL[h] ?? h}</Label>
            {outs.map((e) => (
              <div key={e.id} className="mb-1 flex items-center gap-2 rounded-lg bg-line/40 px-2.5 py-1 text-xs">
                <ArrowRight className="h-3 w-3 text-muted" /><span className="flex-1 truncate">{name(e.target)}</span>
                <button onClick={() => onRemoveEdge(e.id)} className="text-muted hover:text-bad" aria-label={`Disconnect ${name(e.target)}`} title="Remove this line"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {options.length > 0 && (
              <Select aria-label={`${HANDLE_LABEL[h] ?? h} (add connection)`} value="" onChange={(e) => e.target.value && onConnect(node.id, h, e.target.value)} className="h-8 text-xs">
                <option value="">{outs.length ? "+ Also connect to…" : "+ Connect to…"}</option>
                {options.map((n) => <option key={n.id} value={n.id}>{n.data.label || blocks[n.data.blockType]?.label}</option>)}
              </Select>
            )}
            {!outs.length && !options.length && <p className="text-xs text-muted">Add another step to join it here.</p>}
          </div>
        );
      })}
      {!def.out_handles.length && <p className="text-xs text-muted">This is the last step, so nothing comes after it.</p>}
    </div>
  );
}

export function SettingsPanel({ node, onChange, onDelete, onDuplicate, ...conn }: Props) {
  const { blocks, issuesByNode, availableVars, providers } = useEditor();
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-sm text-muted">
        <MousePointerClick className="mb-3 h-6 w-6" />
        Click a block on the canvas to change its settings.
      </div>
    );
  }
  const def = blocks[node.data.blockType];
  if (!def) return null;
  const cfg = { ...def.defaults, ...node.data.config };
  const issues = issuesByNode[node.id] ?? [];
  const vars = availableVars[node.id] ?? ["message", "previous"];
  const Icon = iconFor(def.icon);
  const set = (key: string, value: any) => onChange(node.id, { config: { ...node.data.config, [key]: value } });

  const provider = providers.find((p) => p.id === cfg.provider);

  const renderField = (f: FieldDef) => {
    const v = cfg[f.key];
    const id = `f-${node.id}-${f.key}`;
    switch (f.type) {
      case "textarea":
        return <Textarea id={id} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} rows={f.key === "system_prompt" ? 5 : 3} />;
      case "number":
        return <Input id={id} type="number" min={f.min} max={f.max} value={v ?? ""} onChange={(e) => set(f.key, e.target.value === "" ? "" : Number(e.target.value))} />;
      case "slider":
        return (
          <div className="flex items-center gap-3">
            <input id={id} type="range" min={f.min} max={f.max} step={f.step} value={v ?? 0} onChange={(e) => set(f.key, Number(e.target.value))} className="flex-1 accent-[rgb(var(--accent))]" disabled={provider && provider.models.some((m) => m.id === cfg.model && !m.supports_temperature)} />
            <span className="w-8 text-right text-xs tabular-nums">{Number(v ?? 0).toFixed(1)}</span>
          </div>
        );
      case "boolean":
        return <Switch checked={!!v} onChange={(x) => set(f.key, x)} label={f.label} />;
      case "select":
        return <Select id={id} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
      case "variable":
        return (
          <Select id={id} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)}>
            {!vars.includes(v) && v && <option value={v}>{v} (not available here)</option>}
            {vars.map((x) => <option key={x} value={x}>{x === "previous" ? "previous (last block's result)" : x}</option>)}
          </Select>
        );
      case "provider":
        return (
          <Select id={id} value={v ?? ""} onChange={(e) => {
            const p = providers.find((x) => x.id === e.target.value);
            onChange(node.id, { config: { ...node.data.config, provider: e.target.value, model: p?.models[0]?.id ?? "" } });
          }}>
            {providers.filter((p) => p.implemented).map((p) => <option key={p.id} value={p.id}>{p.name}{p.available ? "" : " — not running"}</option>)}
            {providers.filter((p) => !p.implemented).map((p) => <option key={p.id} value={p.id} disabled>{p.name} — coming later</option>)}
          </Select>
        );
      case "model": {
        const models = provider?.models ?? [];
        const known = models.some((m) => m.id === v);
        return (
          <>
            <Select id={id} value={known ? v : "__custom"} onChange={(e) => e.target.value !== "__custom" && set(f.key, e.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              {provider?.id === "ollama" && <option value="__custom">Other AI brain name…</option>}
            </Select>
            {provider?.id === "ollama" && !known && <Input className="mt-2" value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder="e.g. llama3.1:8b" />}
          </>
        );
      }
      default:
        return <Input id={id} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} />;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-4">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0" style={{ color: def.color }} />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">{def.label} block</div>
            <Input aria-label="Step name" value={node.data.label} onChange={(e) => onChange(node.id, { label: e.target.value })} className="mt-0.5 h-8 font-semibold" maxLength={80} />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">{def.summary}</p>
        {node.data.blockType === "ai_model" && provider && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!provider.is_generative_ai && <Badge tone="warn">Not AI: quotes your documents</Badge>}
            {provider.kind === "local" && <Badge tone="blue">Free · runs on your computer</Badge>}
            {!provider.available && <Badge tone="bad">{provider.id === "ollama" ? "Not installed on this computer" : "Not available"}</Badge>}
          </div>
        )}
        {issues.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {issues.map((i, k) => (
              <p key={k} className={`flex gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${i.severity === "error" ? "bg-bad/10 text-bad" : "bg-warn/10 text-warn"}`}>
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{i.message}
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Connections node={node} {...conn} />
        {def.fields.map((f) => (
          <div key={f.key} className={f.type === "boolean" ? "flex items-start justify-between gap-3" : ""}>
            <div className={f.type === "boolean" ? "min-w-0" : ""}>
              <Label htmlFor={`f-${node.id}-${f.key}`} className={f.type === "boolean" ? "mb-0.5" : ""}>{f.label}</Label>
              {f.type === "boolean" && f.help && <p className="text-xs text-muted">{f.help}</p>}
            </div>
            {renderField(f)}
            {f.type !== "boolean" && f.help && <p className="mt-1 text-xs text-muted">{f.help}</p>}
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => onDuplicate(node.id)}><Copy />Duplicate</Button>
        <Button variant="ghost" size="sm" className="flex-1 text-bad hover:text-bad" onClick={() => onDelete(node.id)}><Trash2 />Delete</Button>
      </div>
    </div>
  );
}
