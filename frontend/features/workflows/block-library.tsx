"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { iconFor } from "@/lib/icons";
import type { BlockDef } from "@/types";

const ORDER = ["Basics", "AI", "Knowledge", "Logic"];

export function BlockLibrary({ blocks, onAdd }: { blocks: BlockDef[]; onAdd: (type: string) => void }) {
  const [q, setQ] = useState("");
  const shown = blocks.filter((b) => (b.label + b.summary + b.category).toLowerCase().includes(q.toLowerCase()));
  const cats = ORDER.filter((c) => shown.some((b) => b.category === c));
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <Input aria-label="Search blocks" className="pl-8" placeholder="Search blocks" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="mt-2 text-[11px] text-muted">Drag a block onto the canvas, or click to add it.</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {cats.map((cat) => (
          <div key={cat}>
            <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{cat}</div>
            <div className="space-y-1.5">
              {shown.filter((b) => b.category === cat).map((b) => {
                const Icon = iconFor(b.icon);
                return (
                  <button
                    key={b.type}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("application/aif-block", b.type); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => onAdd(b.type)}
                    data-testid={`block-${b.type}`}
                    className="flex w-full cursor-grab items-start gap-2.5 rounded-xl border border-line bg-card/70 p-2.5 text-left transition hover:border-accent/50 active:cursor-grabbing"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `${b.color}22`, color: b.color }}><Icon className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{b.label}</span>
                      <span className="block text-[11px] leading-snug text-muted">{b.summary}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
