"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, CircleCheck, CircleX, Clock, MinusCircle, Plus } from "lucide-react";
import { iconFor } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { BlockNode } from "./convert";
import { useEditor } from "./editor-context";

function BlockNodeView({ id, data, selected }: NodeProps<BlockNode>) {
  const { blocks, issuesByNode, runByNode, providers, addAfter } = useEditor();
  const provider = data.blockType === "ai_model" ? providers.find((p) => p.id === data.config.provider) : undefined;
  const modelLabel = provider ? (provider.models.find((m) => m.id === data.config.model)?.label ?? data.config.model)?.split(" (")[0] : null;
  const def = blocks[data.blockType];
  const issues = issuesByNode[id] ?? [];
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const run = runByNode[id];
  const Icon = iconFor(def?.icon ?? "Bot");
  const color = def?.color ?? "#888";

  return (
    <div
      className={cn(
        "group relative w-[230px] rounded-md border border-t-[3px] bg-card transition-colors",
        selected ? "border-x-accent border-b-accent ring-1 ring-accent" : errors.length ? "border-x-bad/70 border-b-bad/70" : warnings.length ? "border-x-warn/60 border-b-warn/60" : "border-x-line border-b-line",
        run?.status === "skipped" && "opacity-50"
      )}
      style={{ borderTopColor: color }}
    >
      {def?.accepts_input !== false && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <Icon className="h-4 w-4 shrink-0" style={{ color }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">{data.label || def?.label}</div>
          <div className="text-xs text-muted">{def?.label ?? data.blockType}</div>
        </div>
        {run && (
          <span title={run.message}>
            {run.status === "succeeded" ? <CircleCheck className="h-4 w-4 text-ok" /> : run.status === "failed" ? <CircleX className="h-4 w-4 text-bad" /> : run.status === "paused" ? <Clock className="h-4 w-4 text-warn" /> : <MinusCircle className="h-4 w-4 text-muted" />}
          </span>
        )}
      </div>
      {data.blockType === "ai_model" ? (
        <div className="px-3 pb-2.5 pt-2">
          <div className="flex items-center gap-1 truncate rounded border border-line bg-bg px-2 py-1 text-xs" title="The AI brain this step uses. Change it in this step's settings." data-testid="node-model">
            <span className="truncate">{modelLabel || "No AI brain chosen"}</span>
            {provider && <span className="shrink-0 text-muted">· {provider.name}</span>}
          </div>
          {data.config.role && <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted">{data.config.role}</p>}
        </div>
      ) : (
        <p className="px-3 pb-2.5 pt-1.5 text-sm leading-snug text-muted">{def?.summary}</p>
      )}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className={cn("flex items-start gap-1.5 rounded-b-md border-t px-3 py-1.5 text-xs", errors.length ? "border-bad/30 bg-bad/10 text-bad" : "border-warn/30 bg-warn/10 text-warn")}>
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">{(errors[0] ?? warnings[0]).message}</span>
        </div>
      )}
      {def?.out_handles.length === 1 && <Handle type="source" position={Position.Right} id="out" />}
      {def?.out_handles.length === 2 && (
        <>
          <Handle type="source" position={Position.Right} id="true" style={{ top: "38%", background: "rgb(var(--ok))" }} />
          <Handle type="source" position={Position.Right} id="false" style={{ top: "68%", background: "rgb(var(--bad))" }} />
          <span className="pointer-events-none absolute -right-8 top-[38%] -translate-y-1/2 text-xs font-semibold text-ok">Yes</span>
          <span className="pointer-events-none absolute -right-7 top-[68%] -translate-y-1/2 text-xs font-semibold text-bad">No</span>
        </>
      )}
      {addAfter && !!def?.out_handles.length && (
        <div className={cn("nodrag absolute -bottom-3.5 left-1/2 flex -translate-x-1/2 gap-1 transition", selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
          {def.out_handles.map((h) => (
            <button key={h} data-testid={`add-after-${h}`} title="Add the next step, already joined"
              onClick={(e) => { e.stopPropagation(); addAfter(id, h, { x: e.clientX, y: e.clientY + 12 }); }}
              className={cn("flex h-6 items-center gap-0.5 rounded border bg-card px-1.5 text-xs font-medium hover:border-accent hover:text-accent",
                h === "true" ? "border-ok/50 text-ok" : h === "false" ? "border-bad/50 text-bad" : "border-line text-muted")}>
              <Plus className="h-3.5 w-3.5" />{h === "true" ? "Yes" : h === "false" ? "No" : "Next"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const BlockNodeComponent = memo(BlockNodeView);
