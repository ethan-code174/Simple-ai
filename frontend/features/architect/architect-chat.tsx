"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Minus, Pencil, Plus, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { MarkdownLite } from "@/lib/md";
import type { Issue, WorkflowSpec } from "@/types";

type Change = { kind: "added" | "removed" | "modified" | "connections"; label?: string; type?: string; fields?: string[]; added?: number; removed?: number };
type Proposal = { understood: boolean; message: string; summary: string[]; changes: Change[]; unsupported: { feature: string; explanation: string }[]; spec: WorkflowSpec; validation: { ok: boolean; issues: Issue[] } };
type Msg = { role: "user" | "architect"; text: string; proposal?: Proposal; status?: "pending" | "applied" | "discarded" };

const SUGGESTIONS = [
  "Add a condition that sends complicated questions for human review",
  "Make it more friendly",
  "Always reply in Spanish",
  "Limit replies to 80 words",
  "Show document sources",
];

export function ArchitectChat({ agentId, getSpec, onApplied, intro }: {
  agentId: string;
  getSpec: () => WorkflowSpec;
  onApplied: (spec: WorkflowSpec, version: number) => void;
  intro?: string | null;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(() => [{
    role: "architect",
    text: intro ?? "Hi, I'm **The Architect**. Tell me what to change and I'll show you exactly what will be added, removed or modified before anything happens.",
  }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const p = await api<Proposal>(`/api/agents/${agentId}/architect/propose`, { method: "POST", json: { instruction: text, spec: getSpec() } });
      let reply = p.message;
      if (p.unsupported.length) reply += "\n\nWhat I can't do yet:\n" + p.unsupported.map((u) => `- **${u.feature}**: ${u.explanation}`).join("\n");
      setMsgs((m) => [...m, { role: "architect", text: reply, proposal: p.understood ? p : undefined, status: p.understood ? "pending" : undefined }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "architect", text: `Sorry, something went wrong: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (idx: number, accept: boolean) => {
    const msg = msgs[idx];
    if (!msg.proposal) return;
    if (!accept) {
      setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, status: "discarded" } : x)));
      return;
    }
    try {
      const r = await api<{ agent: { spec: WorkflowSpec }; version: number }>(`/api/agents/${agentId}/architect/apply`, {
        method: "POST", json: { spec: msg.proposal.spec, summary: msg.proposal.summary },
      });
      setMsgs((m) => [...m.map((x, i) => (i === idx ? { ...x, status: "applied" as const } : x)),
        { role: "architect", text: `Done. Saved as **version ${r.version}**. To undo, press Ctrl+Z or restore version ${r.version - 1} in the Versions tab.` }]);
      onApplied(r.agent.spec, r.version);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "architect", text: `I couldn't apply that: ${e.message}` }]);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            {m.role === "user" ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-white">{m.text}</div>
            ) : (
              <div className="flex gap-2.5">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-white"><Sparkles className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1 text-sm text-fg/90">
                  <MarkdownLite text={m.text} />
                  {m.proposal && <ProposalCard p={m.proposal} status={m.status} onAccept={() => decide(i, true)} onDiscard={() => decide(i, false)} />}
                </div>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 pl-10 text-sm text-muted"><Spinner className="h-3.5 w-3.5" />Thinking about your change…</div>}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted hover:border-accent/50 hover:text-fg">{s}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <input aria-label="Message The Architect" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Describe a change…" className="h-9 flex-1 rounded-lg border border-line bg-bg/60 px-3 text-sm focus:border-accent/70 focus:outline-none" />
          <Button size="icon" className="h-9 w-9" disabled={busy || !input.trim()} aria-label="Send"><Send /></Button>
        </form>
      </div>
    </div>
  );
}

function ProposalCard({ p, status, onAccept, onDiscard }: { p: Proposal; status?: Msg["status"]; onAccept: () => void; onDiscard: () => void }) {
  const errors = p.validation.issues.filter((i) => i.severity === "error");
  return (
    <div className="mt-2 rounded-xl border border-line bg-bg/50 p-3">
      <ul className="space-y-1.5 text-[13px]">{p.summary.map((s, i) => <li key={i}><MarkdownLite text={s} /></li>)}</ul>
      <div className="mt-3 space-y-1 border-t border-line pt-2 text-xs">
        {p.changes.map((c, i) => c.kind === "connections" ? (
          <div key={i} className="text-muted">Connections: +{c.added} / −{c.removed}</div>
        ) : (
          <div key={i} className={`flex items-center gap-1.5 ${c.kind === "added" ? "text-ok" : c.kind === "removed" ? "text-bad" : "text-warn"}`}>
            {c.kind === "added" ? <Plus className="h-3 w-3" /> : c.kind === "removed" ? <Minus className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
            <span className="font-medium">{c.label}</span>
            <span className="text-muted">{c.kind === "modified" ? `changed: ${c.fields?.join(", ")}` : c.kind}</span>
          </div>
        ))}
      </div>
      {errors.length > 0 && <p className="mt-2 flex gap-1.5 text-xs text-bad"><AlertTriangle className="h-3.5 w-3.5" />This change would leave problems: {errors[0].message}</p>}
      {status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="success" onClick={onAccept}><Check />Apply change</Button>
          <Button size="sm" variant="ghost" onClick={onDiscard}><X />Discard</Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">{status === "applied" ? "✓ Applied" : "Discarded"}</p>
      )}
    </div>
  );
}
