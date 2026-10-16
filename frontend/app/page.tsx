"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

const STEPS = [
  { title: "Describe it", text: "Say what you want the assistant to do, in your own words." },
  { title: "Build it", text: "You get a workflow of blocks you can rearrange and edit." },
  { title: "Test it", text: "Chat with it and see what each block did." },
  { title: "Launch it", text: "Publish a chat page and share the link." },
];

const EXAMPLE = ["Customer message", "Search documents", "Instructions", "AI model", "Reply"];

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo href="/" />
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/dashboard"><Button>Open dashboard</Button></Link>
          ) : (
            <>
              <Link href="/login"><Button variant="ghost">Sign in</Button></Link>
              <Link href="/signup"><Button>Create an account</Button></Link>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-14">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
          Build an assistant for your business without writing code.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Describe what it should do, adjust the steps, try it out, then share it. Everything runs on models on your own computer.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={user ? "/agents/new" : "/signup"}><Button size="lg">Start building <ArrowRight /></Button></Link>
          <Link href="/templates"><Button size="lg" variant="secondary">See templates</Button></Link>
        </div>

        <section className="mt-16 rounded-lg border border-line bg-card p-6">
          <p className="text-xs font-medium text-muted">For example, you write</p>
          <p className="mt-2 text-base">
            “An assistant for my plumbing business that answers customer questions from my documents and takes booking requests.”
          </p>
          <p className="mt-6 text-xs font-medium text-muted">and get these steps</p>
          <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm">
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
              <span className="text-xs tabular-nums text-muted">{i + 1}</span>
              <h3 className="mt-1 font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-sm text-muted">
          Your assistants only read the documents you give them, and nothing is sent to outside AI services.
        </p>
      </main>
    </div>
  );
}
