"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, BrainCircuit, MessageSquare, Rocket, Send, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

const STEPS = [
  { icon: MessageSquare, title: "Describe it", text: "Tell The Architect what you want in plain English." },
  { icon: Workflow, title: "Build it", text: "Get a visual workflow you can change with drag-and-drop." },
  { icon: BrainCircuit, title: "Test it", text: "Chat with your agent and see exactly what each step did." },
  { icon: Rocket, title: "Launch it", text: "Publish a chat page and share the link." },
];

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-accent/25 blur-[120px]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo href="/" />
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/dashboard"><Button>Open dashboard</Button></Link>
          ) : (
            <>
              <Link href="/login"><Button variant="ghost">Sign in</Button></Link>
              <Link href="/signup"><Button>Get started free</Button></Link>
            </>
          )}
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 text-center">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card/60 px-3 py-1 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" /> No code. Runs on free, local AI models.
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Build your own AI assistant <span className="text-gradient">in minutes</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">Describe it. Build it. Test it. Launch it. AI Factory turns a sentence into a working, editable AI agent.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href={user ? "/agents/new" : "/signup"}><Button size="lg">Create your first agent <ArrowRight /></Button></Link>
            <Link href="/templates"><Button size="lg" variant="secondary">Browse templates</Button></Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.6 }}
          className="mx-auto mt-16 max-w-4xl rounded-2xl border border-line bg-card/70 p-6 text-left shadow-soft backdrop-blur"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-muted">You type</p>
          <p className="mt-2 text-lg">“Create an AI receptionist for my plumbing business that answers customer questions, reads my business documents, and collects booking requests.”</p>
          <p className="mt-6 text-xs font-medium uppercase tracking-wider text-muted">AI Factory builds</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {[["Customer message", MessageSquare, "#38bdf8"], ["Search documents", BookOpen, "#06b6d4"], ["Instructions", Sparkles, "#a78bfa"], ["AI brain", BrainCircuit, "#7c5cff"], ["Reply", Send, "#22c55e"]].map(([label, Icon, color], i, arr) => {
              const I = Icon as typeof Send;
              return (
                <div key={label as string} className="flex items-center gap-2">
                  <span className="flex items-center gap-2 rounded-xl border border-line bg-bg/70 px-3 py-2 text-sm">
                    <I className="h-4 w-4" style={{ color: color as string }} /> {label as string}
                  </span>
                  {i < arr.length - 1 && <ArrowRight className="h-4 w-4 text-muted" />}
                </div>
              );
            })}
          </div>
        </motion.div>

        <div className="mx-auto mt-20 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-line bg-card/60 p-5 text-left">
              <Icon className="h-5 w-5 text-accent" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-12 flex items-center justify-center gap-2 text-sm text-muted">
          <ShieldCheck className="h-4 w-4" /> Your agents only use your documents. Nothing is sent to third-party AI services.
        </p>
      </main>
    </div>
  );
}
