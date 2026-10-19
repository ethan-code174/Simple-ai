"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

const STEPS = [
  { title: "Say what you want", text: "Tell us in your own words what your AI should do." },
  { title: "We make it for you", text: "Your AI is made as a short list of steps. You can change any step." },
  { title: "Try it out", text: "Ask it questions and see how it answers." },
  { title: "Share it", text: "Send people a link so they can use it too." },
];

const EXAMPLE = ["A customer asks a question", "Look in your documents", "Follow your instructions", "Write an answer", "Send the reply"];

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo href="/" />
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/dashboard"><Button>Go to my AIs</Button></Link>
          ) : (
            <>
              <Link href="/login"><Button variant="ghost">Sign in</Button></Link>
              <Link href="/signup"><Button>Sign up free</Button></Link>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-14">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
          Make your own AI helper. No computer skills needed.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Tell it what to do, try it out, then share it with others. It all runs on your own computer.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={user ? "/agents/new" : "/signup"}><Button size="lg">Make my AI <ArrowRight /></Button></Link>
          <Link href="/templates"><Button size="lg" variant="secondary">See ready-made AIs</Button></Link>
        </div>

        <section className="mt-16 rounded-lg border border-line bg-card p-6">
          <p className="text-base font-medium text-muted">For example, you type:</p>
          <p className="mt-2 text-lg">
            “A helper for my plumbing business that answers customer questions using my documents and takes bookings.”
          </p>
          <p className="mt-6 text-base font-medium text-muted">And your AI gets these steps:</p>
          <ol className="mt-3 flex flex-wrap items-center gap-2 text-base">
            {EXAMPLE.map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <span className="rounded-md border border-line bg-bg px-2.5 py-1.5">{label}</span>
                {i < EXAMPLE.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted" />}
              </li>
            ))}
          </ol>
        </section>

        <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ title, text }, i) => (
            <li key={title} className="bg-card p-5">
              <span className="text-base tabular-nums text-muted">Step {i + 1}</span>
              <h3 className="mt-1 text-lg font-medium">{title}</h3>
              <p className="mt-1 text-base text-muted">{text}</p>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-base text-muted">
          Your AI only reads the documents you give it. Nothing is sent to other companies.
        </p>
      </main>
    </div>
  );
}
