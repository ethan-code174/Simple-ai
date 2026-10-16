"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, FilePlus2, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";

const EXAMPLES = [
  "Create an AI receptionist for my plumbing business that answers customer questions, reads my business documents, and collects booking requests.",
  "Make me an AI that responds to customer enquiries using information from uploaded documents.",
  "A friendly FAQ assistant for my bakery that answers questions about our menu and opening hours.",
  "An email assistant that writes polite, professional replies to customers.",
  "A patient tutor that explains maths homework step by step.",
];

const BUILD_STEPS = ["Understanding your request", "Choosing the blocks you need", "Connecting them together", "Checking everything works"];

function NewAgent() {
  const router = useRouter();
  const toast = useToast();
  const welcome = useSearchParams().get("welcome");
  const [prompt, setPrompt] = useState("");
  const [building, setBuilding] = useState(false);
  const [step, setStep] = useState(0);

  const build = async () => {
    if (prompt.trim().length < 3) return;
    setBuilding(true);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, BUILD_STEPS.length - 1)), 450);
    try {
      const r = await api<{ agent: { id: string }; explanation: string }>("/api/architect/create", { method: "POST", json: { prompt } });
      try { sessionStorage.setItem(`aif_explain_${r.agent.id}`, r.explanation); } catch {}
      await new Promise((res) => setTimeout(res, 900));
      router.push(`/agents/${r.agent.id}?new=1`);
    } catch (e: any) {
      toast("error", e.message);
      setBuilding(false);
    } finally {
      clearInterval(timer);
    }
  };

  const blank = async () => {
    try {
      const a = await api<{ id: string }>("/api/agents", { method: "POST", json: { name: "Untitled agent" } });
      router.push(`/agents/${a.id}`);
    } catch (e: any) { toast("error", e.message); }
  };

  return (
    <div className="mx-auto max-w-3xl">
      {welcome && <p className="mb-6 rounded-md border border-line bg-card px-4 py-3 text-sm">Welcome. Start by describing the assistant you'd like to build.</p>}
      <div>
        <h1 className="text-2xl font-semibold">What should your assistant do?</h1>
        <p className="mt-2 text-muted">Describe it like you'd explain it to a new employee. The Architect will build it.</p>
      </div>

      <AnimatePresence mode="wait">
        {!building ? (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-8">
            <div className="rounded-lg border border-line bg-card p-2 focus-within:border-accent">
              <Textarea
                aria-label="Describe your AI"
                autoFocus
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) build(); }}
                placeholder="e.g. An AI receptionist for my hair salon that answers questions about prices and takes booking requests"
                className="min-h-[130px] resize-none border-0 bg-transparent text-base focus:ring-0"
              />
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="text-xs text-muted">Ctrl + Enter to build</span>
                <Button onClick={build} disabled={prompt.trim().length < 3}>Build it</Button>
              </div>
            </div>
            <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wider text-muted">Try an example</p>
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => setPrompt(ex)} className="group flex items-center justify-between rounded-xl border border-line bg-card/50 px-4 py-2.5 text-left text-sm text-muted transition hover:border-accent/50 hover:text-fg">
                  {ex}<ArrowRight className="ml-3 h-4 w-4 shrink-0 opacity-0 transition group-hover:opacity-100" />
                </button>
              ))}
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link href="/templates" className="flex items-center gap-3 rounded-xl border border-line p-4 text-sm hover:border-accent/50"><LayoutTemplate className="h-5 w-5 text-accent" /><span><b>Start from a template</b><br /><span className="text-muted">Ready-made agents you can customise</span></span></Link>
              <button onClick={blank} className="flex items-center gap-3 rounded-xl border border-line p-4 text-left text-sm hover:border-accent/50"><FilePlus2 className="h-5 w-5 text-accent" /><span><b>Start blank</b><br /><span className="text-muted">A simple starter workflow to edit yourself</span></span></button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="building" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-12 max-w-sm space-y-3">
            {BUILD_STEPS.map((s, i) => (
              <motion.div key={s} initial={{ opacity: 0, x: -8 }} animate={{ opacity: i <= step ? 1 : 0.35, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${i < step ? "bg-ok" : i === step ? "bg-accent pulse-ring" : "bg-line"}`} />
                {s}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function NewAgentPage() {
  return <Suspense><NewAgent /></Suspense>;
}
