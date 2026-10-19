"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpen, Check, Copy, ExternalLink, FileText, GraduationCap, Lightbulb, Mail, MessageCircle,
  Send, Settings2, Trash2, UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Hint, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { AgentDetail, Doc, Execution, Provider } from "@/types";

// ---------------------------------------------------------------- the choices on the first screen

type Kind = "customers" | "documents" | "emails" | "tutor" | "other";

const KINDS: { id: Kind; title: string; text: string; icon: typeof MessageCircle }[] = [
  { id: "customers", title: "Answer my customers' questions", text: "Like a friendly receptionist for your business.", icon: MessageCircle },
  { id: "documents", title: "Answer questions about my papers", text: "It reads documents you give it and answers from them.", icon: BookOpen },
  { id: "emails", title: "Help me write emails", text: "It writes polite replies for you to send.", icon: Mail },
  { id: "tutor", title: "Explain things simply", text: "A patient helper for homework or learning.", icon: GraduationCap },
  { id: "other", title: "Something else", text: "Tell it in your own words.", icon: Lightbulb },
];

/** Turns the choices into a sentence the Architect understands. */
function describe(kind: Kind, business: string, extra: string, own: string) {
  const b = business.trim();
  const base = {
    customers: `Create an AI receptionist for ${b || "my business"} that answers customer questions and reads my business documents.`,
    documents: `Make me an AI that answers questions using information from my uploaded documents${b ? ` for ${b}` : ""}.`,
    emails: `An email assistant that writes polite, professional replies to customers${b ? ` for ${b}` : ""}.`,
    tutor: `A patient tutor that explains things step by step${b ? `, helping with ${b}` : ""}.`,
    other: own.trim(),
  }[kind];
  return extra.trim() ? `${base} ${extra.trim()}` : base;
}

const SUGGESTIONS: Record<Kind, string[]> = {
  customers: ["What are your opening hours?", "How much does it cost?", "Can I book an appointment?"],
  documents: ["What is this document about?", "What are the main points?", "Who should I contact?"],
  emails: ["Write a reply thanking a customer for their order", "Say sorry that a delivery is late"],
  tutor: ["Explain fractions simply", "What is photosynthesis?"],
  other: ["Hello! What can you do?", "Can you help me?"],
};

const STEP_NAMES = ["What it does", "About it", "Your documents", "Try it", "Share it"];

// ---------------------------------------------------------------- the wizard

function Wizard() {
  const router = useRouter();
  const toast = useToast();
  const welcome = useSearchParams().get("welcome");
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind | null>(null);
  const [business, setBusiness] = useState("");
  const [aiName, setAiName] = useState("");
  const [extra, setExtra] = useState("");
  const [own, setOwn] = useState("");
  const [building, setBuilding] = useState(false);
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [builtFrom, setBuiltFrom] = useState("");

  const prompt = kind ? describe(kind, business, extra, own) : "";
  const usesDocs = !!agent?.spec.nodes.some((n) => n.type === "knowledge_search");
  const canNext2 = kind === "other" ? own.trim().length >= 5 : true;

  const build = async () => {
    // Nothing changed since we last built: just move on.
    if (agent && builtFrom === prompt + "|" + aiName) { setStep(usesDocs ? 2 : 3); return; }
    setBuilding(true);
    try {
      if (agent) await api(`/api/agents/${agent.id}`, { method: "DELETE" }).catch(() => {});
      const r = await api<{ agent: { id: string } }>("/api/architect/create", { method: "POST", json: { prompt } });
      if (aiName.trim()) await api(`/api/agents/${r.agent.id}`, { method: "PATCH", json: { name: aiName.trim() } });
      const a = await api<AgentDetail>(`/api/agents/${r.agent.id}`);
      setAgent(a);
      setBuiltFrom(prompt + "|" + aiName);
      setStep(a.spec.nodes.some((n) => n.type === "knowledge_search") ? 2 : 3);
    } catch (e: any) {
      toast("error", `Sorry, that didn't work: ${e.message}`);
    } finally {
      setBuilding(false);
    }
  };

  const back = () => setStep((s) => (s === 3 && !usesDocs ? 1 : Math.max(0, s - 1)));

  return (
    <div className="mx-auto max-w-3xl pb-16">
      {welcome && step === 0 && (
        <p className="mb-6 rounded-md border border-line bg-card px-5 py-4 text-lg">Welcome! Let's make your own AI helper together. It only takes a few easy steps.</p>
      )}

      <StepBar step={step} skipDocs={!!agent && !usesDocs} />

      {step > 0 && (
        <Button variant="secondary" size="lg" className="mb-6" onClick={back} disabled={building}><ArrowLeft />Back</Button>
      )}

      {/* 1. What should it do? */}
      {step === 0 && (
        <section aria-labelledby="q1">
          <h1 id="q1" className="text-3xl font-semibold leading-tight">What should your AI help with?</h1>
          <p className="mt-2 text-lg text-muted">Pick the one that fits best. You can change it later.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {KINDS.map(({ id, title, text, icon: Icon }) => (
              <button key={id} onClick={() => { setKind(id); setStep(1); }} data-testid={`kind-${id}`}
                className={cn("flex min-h-[120px] items-start gap-4 rounded-xl border-2 bg-card p-5 text-left transition hover:border-accent focus-visible:border-accent",
                  kind === id ? "border-accent" : "border-line")}>
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><Icon className="h-7 w-7" /></span>
                <span>
                  <span className="block text-xl font-semibold leading-snug">{title}</span>
                  <span className="mt-1 block text-base text-muted">{text}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-8 text-base text-muted">
            Prefer to start from something ready-made? <Link href="/templates" className="font-medium text-accent underline">See ready-made AIs</Link>
          </p>
        </section>
      )}

      {/* 2. A little about it */}
      {step === 1 && kind && (
        <section aria-labelledby="q2">
          <h1 id="q2" className="text-3xl font-semibold leading-tight">{kind === "other" ? "Tell us what your AI should do" : "Tell us a little about it"}</h1>
          <p className="mt-2 text-lg text-muted">Write it the way you'd explain it to a friend. Everything here is optional except where it says so.</p>
          <div className="mt-8 space-y-6">
            {kind === "other" ? (
              <div>
                <Label htmlFor="own">What should your AI do? (needed)</Label>
                <Textarea id="own" aria-label="Describe your AI" autoFocus rows={5} value={own} onChange={(e) => setOwn(e.target.value)} className="text-lg"
                  placeholder="For example: answer questions about my garden centre's plants and opening times" />
              </div>
            ) : (
              <div>
                <Label htmlFor="biz">{kind === "tutor" ? "What subject should it help with?" : "What is your business or project called?"}</Label>
                <Input id="biz" autoFocus value={business} onChange={(e) => setBusiness(e.target.value)} className="text-lg"
                  placeholder={kind === "tutor" ? "For example: maths" : "For example: Bob's Plumbing"} />
              </div>
            )}
            <div>
              <div className="mb-1.5 flex items-center gap-2"><Label htmlFor="name" className="mb-0">What should your AI be called?</Label><Hint text="This is the name people see when they chat with it. Leave it empty and we'll pick one." /></div>
              <Input id="name" value={aiName} onChange={(e) => setAiName(e.target.value)} maxLength={120} className="text-lg" placeholder="For example: Bob's Helper" />
            </div>
            {kind !== "other" && (
              <div>
                <Label htmlFor="extra">Anything else it should know or do?</Label>
                <Textarea id="extra" rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} className="text-lg"
                  placeholder="For example: always be cheerful, and reply in Spanish" />
              </div>
            )}
          </div>
          <Button size="xl" className="mt-10 w-full sm:w-auto" onClick={build} disabled={!canNext2 || building} data-testid="build">
            {building ? <><Spinner className="h-5 w-5" />Making your AI…</> : <>Make my AI<ArrowRight /></>}
          </Button>
          {building && <p className="mt-4 text-lg text-muted" aria-live="polite">Please wait a moment while we put your AI together.</p>}
        </section>
      )}

      {/* 3. Documents */}
      {step === 2 && agent && (
        <section aria-labelledby="q3">
          <h1 id="q3" className="text-3xl font-semibold leading-tight">Give it your documents</h1>
          <p className="mt-2 text-lg text-muted">Your AI answers using these, like price lists, opening hours or a menu. This is optional, and you can add more later.</p>
          <Documents agentId={agent.id} />
          <div className="mt-10 flex flex-wrap gap-3">
            <Button size="xl" onClick={() => setStep(3)} data-testid="docs-next">Next: try it out<ArrowRight /></Button>
          </div>
        </section>
      )}

      {/* 4. Try it */}
      {step === 3 && agent && kind && (
        <section aria-labelledby="q4">
          <h1 id="q4" className="text-3xl font-semibold leading-tight">Try out {agent.name}</h1>
          <p className="mt-2 text-lg text-muted">Ask a question the way a customer would. Nobody else can see this yet.</p>
          <TryIt agent={agent} suggestions={SUGGESTIONS[kind]} onAgent={setAgent} />
          <Button size="xl" className="mt-10" onClick={() => setStep(4)} data-testid="try-next">Next: share it<ArrowRight /></Button>
        </section>
      )}

      {/* 5. Share it */}
      {step === 4 && agent && (
        <section aria-labelledby="q5">
          <h1 id="q5" className="text-3xl font-semibold leading-tight">Share {agent.name}</h1>
          <p className="mt-2 text-lg text-muted">Get a link to a chat page. Anyone with the link can talk to your AI. They can't see or change how it works.</p>
          <ShareIt agent={agent} onAgent={setAgent} />
          <div className="mt-10 flex flex-wrap gap-3">
            <Button size="lg" variant="secondary" onClick={() => router.push("/agents")}>Go to my AIs</Button>
          </div>
        </section>
      )}

      {agent && step >= 2 && (
        <p className="mt-12 border-t border-line pt-6 text-base text-muted">
          <Settings2 className="mr-1.5 inline h-5 w-5 align-text-bottom" />
          For experts: <Link href={`/agents/${agent.id}`} className="font-medium text-accent underline" data-testid="advanced">Advanced: change the steps</Link>
        </p>
      )}
    </div>
  );
}

function StepBar({ step, skipDocs }: { step: number; skipDocs: boolean }) {
  const shown = STEP_NAMES.map((name, i) => ({ name, i })).filter((s) => !(skipDocs && s.i === 2));
  const pos = shown.findIndex((s) => s.i === step);
  return (
    <div className="mb-8" aria-label={`Step ${pos + 1} of ${shown.length}`}>
      <p className="text-base font-medium text-muted">Step {pos + 1} of {shown.length}</p>
      <ol className="mt-2 flex gap-2">
        {shown.map((s) => (
          <li key={s.i} className="flex-1">
            <div className={cn("h-2.5 rounded-full", s.i <= step ? "bg-accent" : "bg-line")} />
            <span className={cn("mt-1.5 hidden text-sm sm:block", s.i === step ? "font-semibold text-fg" : "text-muted")}>{s.name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- step 3: documents

function Documents({ agentId }: { agentId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const load = () => api<Doc[]>(`/api/agents/${agentId}/documents`).then(setDocs).catch(() => {});
  useEffect(() => { load(); }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const d = await api<Doc>(`/api/agents/${agentId}/documents`, { method: "POST", body: fd });
        if (d.status !== "ready") toast("error", `We couldn't read ${d.filename}. ${d.error ?? ""}`);
      } catch (e: any) { toast("error", `We couldn't add ${f.name}. ${e.message}`); }
    }
    setBusy(false);
    load();
  };
  const remove = async (d: Doc) => {
    if (!window.confirm(`Remove "${d.filename}" from your AI?`)) return;
    await api(`/api/documents/${d.id}`, { method: "DELETE" }).catch((e) => toast("error", e.message));
    load();
  };

  return (
    <div className="mt-8">
      <button type="button" onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        className={cn("flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition", drag ? "border-accent bg-accent/5" : "border-line bg-card hover:border-accent")}>
        {busy ? <Spinner className="h-8 w-8 text-accent" /> : <UploadCloud className="h-10 w-10 text-accent" />}
        <span className="text-xl font-semibold">{busy ? "Adding your document…" : "Click here to choose a document"}</span>
        <span className="text-base text-muted">Or drag it onto this box. Word documents need saving as PDF first. PDF, TXT or MD files work.</span>
      </button>
      <input ref={ref} type="file" multiple hidden accept=".pdf,.txt,.md,text/plain,application/pdf,text/markdown" data-testid="wizard-upload"
        onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      {docs.length > 0 && (
        <ul className="mt-6 space-y-3">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-lg border border-line bg-card px-4 py-3 text-lg">
              <FileText className="h-6 w-6 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">{d.filename}</span>
              {d.status === "ready" ? <span className="flex items-center gap-1 text-base text-ok"><Check className="h-5 w-5" />Added</span> : <span className="text-base text-bad">Couldn't read it</span>}
              <Button variant="ghost" size="icon" aria-label={`Remove ${d.filename}`} onClick={() => remove(d)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- step 4: try it

/** Switches every AI brain in this agent to the no-AI Document Quote Finder. */
async function switchToQuoteFinder(agent: AgentDetail): Promise<AgentDetail> {
  const spec = { ...agent.spec, nodes: agent.spec.nodes.map((n) => n.type === "ai_model" ? { ...n, config: { ...n.config, provider: "quotes", model: "quote-finder" } } : n) };
  await api(`/api/agents/${agent.id}/workflow`, { method: "PUT", json: { spec } });
  return api<AgentDetail>(`/api/agents/${agent.id}`);
}

function NoAiBox({ agent, onAgent, compact }: { agent: AgentDetail; onAgent: (a: AgentDetail) => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const hasDocs = agent.spec.nodes.some((n) => n.type === "knowledge_search");
  return (
    <div className={cn("rounded-xl border-2 border-warn/50 bg-warn/10 text-lg", compact ? "mt-3 p-4" : "mt-6 p-5")} data-testid="no-ai-box">
      <p className="font-semibold">Your AI can't think yet.</p>
      <p className="mt-1 text-base">It needs a free program called Ollama on this computer, and it isn't installed.
        {hasDocs ? " Until then, you can use the no-AI option: it answers by quoting the documents you gave it." : ""}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {hasDocs && (
          <Button size="lg" disabled={busy} data-testid="use-quotes"
            onClick={async () => { setBusy(true); try { onAgent(await switchToQuoteFinder(agent)); toast("ok", "Done. Your AI now answers by quoting your documents."); } catch (e: any) { toast("error", e.message); } finally { setBusy(false); } }}>
            {busy && <Spinner />}Use the no-AI option
          </Button>
        )}
        <a href="https://ollama.com/download" target="_blank" rel="noreferrer"><Button size="lg" variant="secondary"><ExternalLink />How to install Ollama</Button></a>
      </div>
    </div>
  );
}

type Turn = { role: "user" | "assistant"; text: string; run?: Execution };

function TryIt({ agent, suggestions, onAgent }: { agent: AgentDetail; suggestions: string[]; onAgent: (a: AgentDetail) => void }) {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { api<Provider[]>("/api/providers").then(setProviders).catch(() => setProviders([])); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [turns, busy]);

  const ollama = providers?.find((p) => p.id === "ollama");
  const needsOllama = agent.spec.nodes.some((n) => n.type === "ai_model" && n.config.provider === "ollama");
  const blocked = needsOllama && ollama && !ollama.available;

  const send = async (text: string) => {
    text = text.trim();
    if (!text || busy) return;
    setInput("");
    const history = turns.filter((t) => t.role === "user" || t.run?.status === "succeeded").map((t) => ({ role: t.role, content: t.role === "user" ? t.text : t.run?.reply ?? "" }));
    setTurns((t) => [...t, { role: "user", text }]);
    setBusy(true);
    try {
      const run = await api<Execution>(`/api/agents/${agent.id}/run`, { method: "POST", json: { message: text, history } });
      setTurns((t) => [...t, { role: "assistant", text: run.reply ?? "", run }]);
    } catch (e: any) {
      setTurns((t) => [...t, { role: "assistant", text: "", run: { status: "failed", error: { code: "request", message: e.message } } as any }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-6">
      {blocked && <NoAiBox agent={agent} onAgent={onAgent} />}
      <div className="mt-6 rounded-xl border border-line bg-card">
        <div className="max-h-[420px] min-h-[160px] space-y-4 overflow-y-auto p-5" aria-live="polite">
          {turns.length === 0 && <p className="text-lg text-muted">Type a question below, or tap one of the examples.</p>}
          {turns.map((t, i) => t.role === "user" ? (
            <div key={i} className="flex justify-end"><div className="max-w-[80%] rounded-xl bg-accent px-4 py-3 text-lg text-white dark:text-bg">{t.text}</div></div>
          ) : <Answer key={i} run={t.run!} agent={agent} onAgent={onAgent} />)}
          {busy && <p className="flex items-center gap-2 text-lg text-muted"><Spinner className="h-5 w-5" />Thinking…</p>}
          <div ref={end} />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line px-5 pt-4">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy} className="min-h-11 rounded-full border border-line px-4 py-2 text-base hover:border-accent hover:text-accent disabled:opacity-50">{s}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-3 p-5">
          <input aria-label="Your question" data-testid="wizard-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question here"
            className="h-14 min-w-0 flex-1 rounded-lg border border-line bg-bg px-4 text-lg focus:border-accent focus:outline-none" />
          <Button size="lg" disabled={busy || !input.trim()}><Send />Ask</Button>
        </form>
      </div>
    </div>
  );
}

function Answer({ run, agent, onAgent }: { run: Execution; agent: AgentDetail; onAgent: (a: AgentDetail) => void }) {
  if (run.status === "failed" || run.status === "cancelled") {
    return (
      <div className="max-w-[90%] rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-lg">
        <p>{run.error?.message ?? "Sorry, something went wrong."}</p>
        {run.error?.code === "provider_unreachable" && <NoAiBox agent={agent} onAgent={onAgent} compact />}
        {run.error?.details && (
          <details className="mt-2 text-base text-muted"><summary className="cursor-pointer">More details</summary><p className="mt-1 break-words font-mono text-sm">{run.error.details}</p></details>
        )}
      </div>
    );
  }
  return (
    <div className="max-w-[90%]">
      <div className={cn("whitespace-pre-wrap rounded-xl border px-4 py-3 text-lg", run.status === "waiting_approval" ? "border-warn/50 bg-warn/10" : "border-line bg-bg")}>{run.reply}</div>
      {run.status === "waiting_approval" && <p className="mt-1 text-base text-muted">Your AI is waiting for you to check this. You'll find it under “Waiting for you”.</p>}
      {run.sources?.length > 0 && <p className="mt-1 text-base text-muted">Answer found in: {Array.from(new Set(run.sources.map((s) => s.source_label.split(" ·")[0]))).join(", ")}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- step 5: share it

function ShareIt({ agent, onAgent }: { agent: AgentDetail; onAgent: (a: AgentDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState("");
  const pub = agent.publication;
  const url = pub?.is_live ? `${window.location.origin}/a/${pub.slug}` : "";

  const share = async () => {
    setBusy(true);
    setProblem("");
    try {
      await api(`/api/agents/${agent.id}/publication`, { method: "PUT", json: {
        display_name: agent.name, description: agent.description.slice(0, 1000),
        welcome_message: `Hello! I'm ${agent.name}. How can I help you today?`, avatar_emoji: "🤖", accent_color: "#0f6e64", slug: null,
      } });
      onAgent(await api<AgentDetail>(`/api/agents/${agent.id}/publish`, { method: "POST" }));
    } catch (e: any) {
      setProblem(e.detail?.issues?.[0]?.message ?? e.message);
    } finally { setBusy(false); }
  };

  if (!url) return (
    <div className="mt-8">
      <Button size="xl" onClick={share} disabled={busy} data-testid="share">{busy ? <Spinner className="h-5 w-5" /> : <Send />}Share my AI</Button>
      {problem && (
        <div className="mt-6 rounded-xl border-2 border-bad/40 bg-bad/10 p-5 text-lg">
          <p className="font-semibold">It isn't ready to share yet.</p>
          <p className="mt-1">{problem}</p>
          <Link href={`/agents/${agent.id}`} className="mt-3 inline-block font-medium text-accent underline">Open the steps to fix it</Link>
        </div>
      )}
    </div>
  );
  return (
    <div className="mt-8 rounded-xl border-2 border-ok/50 bg-ok/10 p-6">
      <p className="flex items-center gap-2 text-xl font-semibold text-ok"><Check className="h-6 w-6" />Your AI is ready to use!</p>
      <p className="mt-2 text-lg">Send this link to anyone, or put it on your website:</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <input readOnly value={url} data-testid="public-url" onFocus={(e) => e.target.select()} className="h-14 min-w-0 flex-1 rounded-lg border border-line bg-card px-4 text-lg" />
        <Button size="lg" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? <><Check />Copied</> : <><Copy />Copy link</>}</Button>
        <a href={url} target="_blank" rel="noreferrer"><Button size="lg" variant="secondary"><ExternalLink />Open it</Button></a>
      </div>
    </div>
  );
}

export default function NewAgentPage() {
  return <Suspense><Wizard /></Suspense>;
}
