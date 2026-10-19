"use client";

import { use, useEffect, useRef, useState } from "react";
import { FileText, Send } from "lucide-react";
import { api } from "@/lib/api";

type Info = { slug: string; name: string; description: string; welcome_message: string; avatar_emoji: string; accent_color: string };
type Msg = { role: "user" | "assistant"; text: string; sources?: string[]; pending?: { runId: string; token: string }; error?: boolean };

export default function PublicChat({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { api<Info>(`/api/public/${slug}`).then(setInfo).catch(() => setMissing(true)); }, [slug]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  // Poll runs that are waiting for the business owner's approval.
  useEffect(() => {
    const waiting = msgs.map((m, i) => [m, i] as const).filter(([m]) => m.pending);
    if (!waiting.length) return;
    const t = setInterval(async () => {
      for (const [m, i] of waiting) {
        try {
          const r = await api(`/api/public/${slug}/runs/${m.pending!.runId}?token=${m.pending!.token}`);
          if (r.status !== "waiting_approval") {
            setMsgs((all) => [...all.map((x, j) => (j === i ? { ...x, pending: undefined } : x)), { role: "assistant", text: r.reply ?? (r.error ? "Sorry, I couldn't answer that. Please try asking again." : "Sorry, I couldn't answer that. Please try asking again."), sources: r.sources, error: !!r.error }]);
          }
        } catch {}
      }
    }, 5000);
    return () => clearInterval(t);
  }, [msgs, slug]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.text }));
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await api(`/api/public/${slug}/chat`, { method: "POST", json: { message: text, history } });
      setMsgs((m) => [...m, {
        role: "assistant", text: r.reply ?? "Sorry, I couldn't answer that. Please try asking again.", sources: r.sources, error: !!r.error,
        pending: r.status === "waiting_approval" ? { runId: r.run_id, token: r.view_token } : undefined,
      }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", text: "Sorry, that didn't go through. Please check your internet and try again.", error: true }]);
    } finally { setBusy(false); }
  };

  if (missing) return <div className="grid h-screen place-items-center px-6 text-center"><div><h1 className="text-2xl font-semibold">This page isn't available</h1><p className="mt-2 text-lg text-muted">The owner may have stopped sharing it. Please check the link with the person who sent it to you.</p></div></div>;
  if (!info) return <div className="grid h-screen place-items-center"><span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>;
  const accent = info.accent_color;

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <span className="grid h-10 w-10 place-items-center rounded-full text-xl" style={{ background: `${accent}22` }}>{info.avatar_emoji}</span>
          <div className="min-w-0"><h1 className="truncate text-lg font-semibold">{info.name}</h1>{info.description && <p className="truncate text-base text-muted">{info.description}</p>}</div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-3 px-4 py-6" aria-live="polite">
          <Bubble emoji={info.avatar_emoji} accent={accent} text={info.welcome_message} />
          {msgs.map((m, i) => m.role === "user" ? (
            <div key={i} className="flex justify-end"><div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md px-4 py-3 text-base text-white" style={{ background: accent }}>{m.text}</div></div>
          ) : (
            <Bubble key={i} emoji={info.avatar_emoji} accent={accent} text={m.text} sources={m.sources} error={m.error} pending={!!m.pending} />
          ))}
          {busy && <div className="flex items-center gap-2 pl-12 text-base text-muted"><span>Writing an answer</span><span className="flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:240ms]" /></span></div>}
          <div ref={end} />
        </div>
      </main>
      <footer className="border-t border-line bg-panel/80">
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mx-auto flex max-w-2xl gap-2 px-4 py-3">
          <input aria-label="Your message" value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder="Type your question here" className="h-14 flex-1 rounded-xl border border-line bg-bg px-4 text-lg focus:outline-none" style={{ borderColor: input ? accent : undefined }} />
          <button disabled={busy || !input.trim()} className="flex h-14 items-center gap-2 rounded-xl px-5 text-lg font-medium text-white disabled:opacity-50" style={{ background: accent }} aria-label="Send"><Send className="h-5 w-5" />Send</button>
        </form>
        <p className="pb-2 text-center text-sm text-muted">Made with AI Factory. AI can make mistakes, so check anything important.</p>
      </footer>
    </div>
  );
}

function Bubble({ emoji, accent, text, sources, error, pending }: { emoji: string; accent: string; text: string; sources?: string[]; error?: boolean; pending?: boolean }) {
  return (
    <div className="flex gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-base" style={{ background: `${accent}22` }}>{emoji}</span>
      <div className="max-w-[80%]">
        <div className={`whitespace-pre-wrap rounded-2xl rounded-bl-md border px-4 py-3 text-base ${error ? "border-bad/40 bg-bad/10" : "border-line bg-card"}`}>{text}</div>
        {pending && <p className="mt-1 text-base text-muted">Someone is checking this answer. Please keep this page open. It will update by itself.</p>}
        {sources && sources.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{sources.map((s) => <span key={s} className="flex items-center gap-1 rounded-md bg-line/50 px-2 py-0.5 text-sm text-muted"><FileText className="h-3.5 w-3.5" aria-label="From the document" />{s}</span>)}</div>}
      </div>
    </div>
  );
}
