"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, CircleCheck, CircleX, Clock, MinusCircle } from "lucide-react";
import { iconFor } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { BlockNode } from "./convert";
import { useEditor } from "./editor-context";

function BlockNodeView({ id, data, selected }: NodeProps<BlockNode>) {
  const { blocks, issuesByNode, runByNode } = useEditor();
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
        "w-[230px] rounded-2xl border bg-card shadow-soft transition",
        selected ? "border-accent ring-2 ring-accent/30" : errors.length ? "border-bad/70" : warnings.length ? "border-warn/60" : "border-line",
        run?.status === "skipped" && "opacity-50"
      )}
    >
      {def?.accepts_input !== false && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2.5 px-3.5 pt-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${color}22`, color }}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">{data.label || def?.label}</div>
          <div className="text-[11px] text-muted">{def?.label ?? data.blockType}</div>
        </div>
        {run && (
          <span title={run.message}>
            {run.status === "succeeded" ? <CircleCheck className="h-4 w-4 text-ok" /> : run.status === "failed" ? <CircleX className="h-4 w-4 text-bad" /> : run.status === "paused" ? <Clock className="h-4 w-4 text-warn" /> : <MinusCircle className="h-4 w-4 text-muted" />}
          </span>
        )}
      </div>
      <p className="px-3.5 pb-3 pt-2 text-[11.5px] leading-snug text-muted">{def?.summary}</p>
      {(errors.length > 0 || warnings.length > 0) && (
        <div className={cn("flex items-start gap-1.5 rounded-b-2xl border-t px-3.5 py-2 text-[11px]", errors.length ? "border-bad/30 bg-bad/10 text-bad" : "border-warn/30 bg-warn/10 text-warn")}>
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">{(errors[0] ?? warnings[0]).message}</span>
        </div>
      )}
      {def?.out_handles.length === 1 && <Handle type="source" position={Position.Right} id="out" />}
      {def?.out_handles.length === 2 && (
        <>
          <Handle type="source" position={Position.Right} id="true" style={{ top: "38%", background: "rgb(var(--ok))" }} />
          <Handle type="source" position={Position.Right} id="false" style={{ top: "68%", background: "rgb(var(--bad))" }} />
          <span className="pointer-events-none absolute -right-8 top-[38%] -translate-y-1/2 text-[10px] font-semibold text-ok">Yes</span>
          <span className="pointer-events-none absolute -right-7 top-[68%] -translate-y-1/2 text-[10px] font-semibold text-bad">No</span>
        </>
      )}
    </div>
  );
}

export const BlockNodeComponent = memo(BlockNodeView);
