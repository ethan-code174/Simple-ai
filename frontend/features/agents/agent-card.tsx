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
      toast("error", "That didn't work. Please refresh the page and try again.");
    }
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="group relative flex flex-col rounded-lg border border-line bg-card p-4 transition-colors hover:border-fg/30">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-md border border-line text-muted">
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-2">
          {agent.status === "published" ? <Badge tone="ok"><Globe className="h-3 w-3" />Shared</Badge> : <Badge>Only you</Badge>}
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} aria-label="More choices for this AI" title="More choices" className="rounded-md p-2 text-muted hover:bg-line/50 hover:text-fg">
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-xl border border-line bg-panel py-1 text-base shadow-soft">
                  <MenuItem icon={<Pencil />} onClick={() => { setMenu(false); setRenaming(true); }}>Change the name</MenuItem>
                  <MenuItem icon={<Copy />} onClick={() => act(() => api(`/api/agents/${agent.id}/duplicate`, { method: "POST" }), "A copy of this AI was made.")}>Make a copy</MenuItem>
                  {agent.status === "published" ? (
                    <MenuItem icon={<EyeOff />} onClick={() => { if (!window.confirm("Stop sharing this AI? The link will stop working for everyone.")) { setMenu(false); return; } act(() => api(`/api/agents/${agent.id}/unpublish`, { method: "POST" }), "You stopped sharing this AI. The link no longer works."); }}>Stop sharing</MenuItem>
                  ) : (
                    <MenuItem icon={<Globe />} onClick={() => act(() => api(`/api/agents/${agent.id}/publish`, { method: "POST" }), "Shared. Anyone with the link can use it now.")}>Share</MenuItem>
                  )}
                  <MenuItem icon={<Trash2 />} danger onClick={() => { setMenu(false); setDeleting(true); }}>Delete this AI</MenuItem>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <Link href={`/agents/${agent.id}`} className="mt-4 block">
        <h3 className="text-lg font-semibold tracking-tight group-hover:text-accent">{agent.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-[3rem] text-base text-muted">{agent.description || "No description yet."}</p>
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span className="flex items-center gap-1"><BrainCircuit className="h-4 w-4" aria-label="AI brain" />{agent.model ? `AI brain: ${agent.model}` : "No AI brain chosen"}</span>
        <span className="flex items-center gap-1"><Play className="h-4 w-4" />{agent.executions} {agent.executions === 1 ? "conversation" : "conversations"}</span>
        <span className="flex items-center gap-1"><Clock className="h-4 w-4" />Changed {timeAgo(agent.updated_at)}</span>
      </div>
      <div className="mt-4 flex gap-2">
        <Link href={`/agents/${agent.id}`} className="flex-1"><Button variant="secondary" className="w-full">Open</Button></Link>
        {agent.public_slug && (
          <a href={`/a/${agent.public_slug}`} target="_blank" rel="noreferrer"><Button variant="ghost"><ExternalLink />See shared page</Button></a>
        )}
      </div>

      <Dialog open={renaming} onClose={() => setRenaming(false)} title="Change the name">
        <form onSubmit={(e) => { e.preventDefault(); setRenaming(false); act(() => api(`/api/agents/${agent.id}`, { method: "PATCH", json: { name } }), "The new name is saved."); }} className="space-y-4">
          <Input autoFocus aria-label="New name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button><Button disabled={!name.trim()}>Save name</Button></div>
        </form>
      </Dialog>
      <Dialog open={deleting} onClose={() => setDeleting(false)} title={`Delete “${agent.name}”?`} description="This deletes the AI, its documents, its past conversations and its shared page. You can't get it back.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(false)}>No, keep it</Button>
          <Button variant="danger" onClick={() => { setDeleting(false); act(() => api(`/api/agents/${agent.id}`, { method: "DELETE" }), "The AI was deleted."); }}>Yes, delete it</Button>
        </div>
      </Dialog>
    </motion.div>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-line/50 [&_svg]:h-4 [&_svg]:w-4 ${danger ? "text-bad" : ""}`}>
      {icon}{children}
    </button>
  );
}
