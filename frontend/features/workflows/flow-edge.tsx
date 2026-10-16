"use client";

import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { useEditor } from "./editor-context";

/** A connection line. Selecting it shows a remove button; its ends can be dragged onto another block. */
function FlowEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, selected, markerEnd, interactionWidth }: EdgeProps) {
  const { removeEdge } = useEditor();
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 6 });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={interactionWidth ?? 24} />
      {(label || selected) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan pointer-events-auto absolute flex items-center gap-1" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
            {label && <span className="rounded border border-line bg-card px-1.5 py-px text-[11px] font-medium">{label}</span>}
            {selected && (
              <button
                onClick={() => removeEdge?.(id)}
                className="grid h-5 w-5 place-items-center rounded border border-line bg-card text-muted hover:border-bad hover:text-bad"
                title="Remove this connection" aria-label="Remove this connection" data-testid="edge-remove"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FlowEdge = memo(FlowEdgeView);
