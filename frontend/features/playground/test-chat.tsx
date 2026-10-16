"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Clock, Coins, FileText, Hash, RotateCcw, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { statusLabel, statusTone } from "@/lib/status";
import { useToast } from "@/lib/toast";
import { money, ms } from "@/lib/utils";
import type { Approval, Execution } from "@/types";

type Turn = { role: "user" | "assistant"; text: string; run?: Execution };

export function TestChat({ agentId, onRun, beforeRun }: { agentId: string; onRun: (r: Execution) => void; beforeRun: () => Promise<void> }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const toast = useToast();
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const history = turns.filter((t) => t.role === "user" || t.run?.status === "succeeded").map((t) => ({ role: t.role, content: t.role === "user" ? t.text : t.run?.reply ?? "" }));
    setTurns((t) => [...t, { role: "user", text }]);
    setBusy(true);
    try {
      await beforeRun();
      const run = await api<Execution>(`/api/agents/${agentId}/run`, { method: "POST", json: { message: text, history } });
      setTurns((t) => [...t, { role: "assistant", text: run.reply ?? "", run }]);
      onRun(run);
    } catch (e: any) {
      setTurns((t) => [...t, { role: "assistant", text: "", run: { status: "failed", error: { code: "request", message: e.message } } as any }]);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (run: Execution, decision: "approved" | "rejected") => {
    try {
      const pending = await api<Approval[]>("/api/approvals");
      const ap = pending.find((a) => a.execution_id === run.id);
      if (!ap) return toast("error", "This approval was already handled.");
      const r = await api<Execution>(`/api/approvals/${ap.id}/decide`, { method: "POST", json: { decision } });
      setTurns((t) => [...t, { role: "assistant", text: r.reply ?? "", run: r }]);
      onRun(r);
    } catch (e: any) { toast("error", e.message); }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {turns.length === 0 && (
          <div className="grid h-full place-items-center text-center text-sm text-muted">
            <div>Send a message to test your agent. The real workflow runs, step by step.<br /><span className="text-xs">Try “What are your opening hours?”</span></div>
          </div>
        )}
        {turns.map((t, i) => t.role === "user" ? (
          <div key={i} className="flex justify-end"><div className="max-w-[75%] rounded-lg bg-line/70 px-3 py-2 text-sm">{t.text}</div></div>
        ) : (
          <AssistantTurn key={i} run={t.run!} onDecide={decide} />
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-3.5 w-3.5" />Running your workflow…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 border-t border-line p-3">
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" title="Start a new conversation" aria-label="Clear chat" onClick={() => setTurns([])}><RotateCcw /></Button>
        <input data-testid="test-input" aria-label="Test message" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message as if you were a customer…" className="h-9 flex-1 rounded-lg border border-line bg-bg/60 px-3 text-sm focus:border-accent/70 focus:outline-none" />
        <Button disabled={busy || !input.trim()} className="h-9"><Send />Send</Button>
      </form>
    </div>
  );
}

function AssistantTurn({ run, onDecide }: { run: Execution; onDecide: (r: Execution, d: "approved" | "rejected") => void }) {
  const [open, setOpen] = useState(false);
  const failed = run.status === "failed" || run.status === "cancelled";
  const executed = run.logs?.filter((l) => l.status !== "skipped") ?? [];
  return (
    <div className="max-w-[85%]">
      {failed ? (
        <div className="rounded-2xl rounded-bl-md border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-sm">
          <div className="flex items-start gap-2 text-bad"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{run.error?.message ?? "The run failed."}</span></div>
          {run.error?.node_label && <p className="mt-1 text-xs text-muted">Problem in block: <b>{run.error.node_label}</b></p>}
          {run.error?.details && (
            <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Technical details</summary><pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px]">{run.error.code}: {run.error.details}</pre></details>
          )}
        </div>
      ) : (
        <div className={`whitespace-pre-wrap rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm ${run.status === "waiting_approval" ? "border-warn/40 bg-warn/10" : "border-line bg-card"}`}>{run.reply}</div>
      )}
      {run.status === "waiting_approval" && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-warn">Paused for human review. As the owner you can decide now:</span>
          <Button size="sm" variant="success" onClick={() => onDecide(run, "approved")}><Check />Approve</Button>
          <Button size="sm" variant="secondary" onClick={() => onDecide(run, "rejected")}><X />Reject</Button>
        </div>
      )}
      {run.id && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <Badge tone={statusTone(run.status)}>{statusLabel(run.status)}</Badge>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{ms(run.duration_ms)}</span>
          <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{run.prompt_tokens + run.completion_tokens} tokens</span>
          <span className="flex items-center gap-1"><Coins className="h-3 w-3" />{money(run.cost_usd)}</span>
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-0.5 hover:text-fg">{executed.length} blocks ran<ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} /></button>
        </div>
      )}
      {run.sources?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {run.sources.map((s, i) => <span key={i} title={s.excerpt} className="flex items-center gap-1 rounded-md bg-accent2/10 px-2 py-0.5 text-[11px] text-accent2"><FileText className="h-3 w-3" />{s.source_label}</span>)}
        </div>
      )}
      {open && (
        <ol className="mt-2 space-y-1 rounded-xl border border-line bg-bg/50 p-2.5 text-[11px]">
          {run.logs.map((l, i) => (
            <li key={i} className={`flex gap-2 ${l.status === "skipped" ? "opacity-50" : ""}`}>
              <span className={l.status === "succeeded" ? "text-ok" : l.status === "failed" ? "text-bad" : l.status === "paused" ? "text-warn" : "text-muted"}>●</span>
              <span className="font-medium">{l.label}</span><span className="text-muted">{l.message}</span><span className="ml-auto text-muted">{ms(l.duration_ms)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
