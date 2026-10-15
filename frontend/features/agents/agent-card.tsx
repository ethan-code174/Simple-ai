"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, BrainCircuit, Copy, ExternalLink, Globe, MoreHorizontal, Pencil, Play, Trash2, EyeOff, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { timeAgo } from "@/lib/utils";
import type { AgentSummary } from "@/types";

export function AgentCard({ agent, onChange }: { agent: AgentSummary; onChange: () => void }) {
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(agent.name);

  const act = async (fn: () => Promise<any>, ok: string) => {
    setMenu(false);
    try {
      await fn();
      toast("ok", ok);
      onChange();
    } catch (e: any) {
      toast("error", e.message);
    }
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="group relative flex flex-col rounded-2xl border border-line bg-card p-5 shadow-soft transition hover:border-accent/40">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent/20 to-accent2/20 text-accent">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2">
          {agent.status === "published" ? <Badge tone="ok"><Globe className="h-3 w-3" />Live</Badge> : <Badge>Draft</Badge>}
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} aria-label="Agent actions" className="rounded-md p-1 text-muted hover:bg-line/50 hover:text-fg">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-panel py-1 text-sm shadow-soft">
                  <MenuItem icon={<Pencil />} onClick={() => { setMenu(false); setRenaming(true); }}>Rename</MenuItem>
                  <MenuItem icon={<Copy />} onClick={() => act(() => api(`/api/agents/${agent.id}/duplicate`, { method: "POST" }), "Agent duplicated")}>Duplicate</MenuItem>
                  {agent.status === "published" ? (
                    <MenuItem icon={<EyeOff />} onClick={() => act(() => api(`/api/agents/${agent.id}/unpublish`, { method: "POST" }), "Agent unpublished")}>Unpublish</MenuItem>
                  ) : (
                    <MenuItem icon={<Globe />} onClick={() => act(() => api(`/api/agents/${agent.id}/publish`, { method: "POST" }), "Agent published")}>Publish</MenuItem>
                  )}
                  <MenuItem icon={<Trash2 />} danger onClick={() => { setMenu(false); setDeleting(true); }}>Delete</MenuItem>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <Link href={`/agents/${agent.id}`} className="mt-4 block">
        <h3 className="font-semibold tracking-tight group-hover:text-accent">{agent.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted">{agent.description || "No description yet."}</p>
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1"><BrainCircuit className="h-3.5 w-3.5" />{agent.model ?? "No AI model"}</span>
        <span className="flex items-center gap-1"><Play className="h-3.5 w-3.5" />{agent.executions} runs</span>
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{timeAgo(agent.updated_at)}</span>
      </div>
      <div className="mt-4 flex gap-2">
        <Link href={`/agents/${agent.id}`} className="flex-1"><Button variant="secondary" size="sm" className="w-full">Open</Button></Link>
        {agent.public_slug && (
          <a href={`/a/${agent.public_slug}`} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm"><ExternalLink />Visit</Button></a>
        )}
      </div>

      <Dialog open={renaming} onClose={() => setRenaming(false)} title="Rename agent">
        <form onSubmit={(e) => { e.preventDefault(); setRenaming(false); act(() => api(`/api/agents/${agent.id}`, { method: "PATCH", json: { name } }), "Renamed"); }} className="space-y-4">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button><Button disabled={!name.trim()}>Save</Button></div>
        </form>
      </Dialog>
      <Dialog open={deleting} onClose={() => setDeleting(false)} title={`Delete “${agent.name}”?`} description="This deletes the agent, its documents, run history and public page. This can't be undone.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => { setDeleting(false); act(() => api(`/api/agents/${agent.id}`, { method: "DELETE" }), "Agent deleted"); }}>Delete agent</Button>
        </div>
      </Dialog>
    </motion.div>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-line/50 [&_svg]:h-4 [&_svg]:w-4 ${danger ? "text-bad" : ""}`}>
      {icon}{children}
    </button>
  );
}
