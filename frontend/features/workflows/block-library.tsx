"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { iconFor } from "@/lib/icons";
import type { BlockDef } from "@/types";

const ORDER = ["Basics", "AI", "Your documents", "Choices"];

export function BlockLibrary({ blocks, onAdd }: { blocks: BlockDef[]; onAdd: (type: string) => void }) {
  const [q, setQ] = useState("");
  const shown = blocks.filter((b) => (b.label + b.summary + b.category).toLowerCase().includes(q.toLowerCase()));
  const cats = ORDER.filter((c) => shown.some((b) => b.category === c));
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <Input aria-label="Search steps" className="pl-8" placeholder="Search steps" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="mt-2 text-xs text-muted">Click a step to add it after the one you picked, or drag it onto the board.</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {cats.map((cat) => (
          <div key={cat}>
            <div className="mb-1.5 px-1 text-xs font-medium text-muted">{cat}</div>
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
                    className="flex w-full cursor-grab items-start gap-2.5 rounded-md border border-line bg-card p-2.5 text-left transition-colors hover:border-fg/30 active:cursor-grabbing"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: b.color }} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{b.label}</span>
                      <span className="block text-xs leading-snug text-muted">{b.summary}</span>
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
