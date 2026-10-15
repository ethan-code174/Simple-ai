"use client";

import { AlertTriangle, Copy, MousePointerClick, Trash2 } from "lucide-react";
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
};

export function SettingsPanel({ node, onChange, onDelete, onDuplicate }: Props) {
  const { blocks, issuesByNode, availableVars, providers } = useEditor();
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-sm text-muted">
        <MousePointerClick className="mb-3 h-8 w-8 text-accent/70" />
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
              {provider?.id === "ollama" && <option value="__custom">Other model name…</option>}
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
          <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${def.color}22`, color: def.color }}><Icon className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">{def.label} block</div>
            <Input aria-label="Block name" value={node.data.label} onChange={(e) => onChange(node.id, { label: e.target.value })} className="mt-0.5 h-8 font-semibold" maxLength={80} />
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-accent/5 px-3 py-2 text-xs text-muted"><b className="text-fg">{def.label}</b> — {def.summary}</p>
        {node.data.blockType === "ai_model" && provider && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!provider.is_generative_ai && <Badge tone="warn">Not generative AI</Badge>}
            {provider.kind === "local" && <Badge tone="blue">Free · runs on your computer</Badge>}
            {!provider.available && <Badge tone="bad">{provider.id === "ollama" ? "Ollama isn't running" : "Unavailable"}</Badge>}
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
        {def.fields.map((f) => (
          <div key={f.key} className={f.type === "boolean" ? "flex items-start justify-between gap-3" : ""}>
            <div className={f.type === "boolean" ? "min-w-0" : ""}>
              <Label htmlFor={`f-${node.id}-${f.key}`} className={f.type === "boolean" ? "mb-0.5" : ""}>{f.label}</Label>
              {f.type === "boolean" && f.help && <p className="text-[11px] text-muted">{f.help}</p>}
            </div>
            {renderField(f)}
            {f.type !== "boolean" && f.help && <p className="mt-1 text-[11px] text-muted">{f.help}</p>}
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
