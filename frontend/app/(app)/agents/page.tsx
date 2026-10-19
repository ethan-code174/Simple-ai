"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bot, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/misc";
import { AgentCard } from "@/features/agents/agent-card";
import { api } from "@/lib/api";
import type { AgentSummary } from "@/types";

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [q, setQ] = useState("");
  const load = useCallback(() => api<AgentSummary[]>("/api/agents").then(setAgents), []);
  useEffect(() => { load(); }, [load]);
  const shown = (agents ?? []).filter((a) => (a.name + a.description).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="My AIs" subtitle="All the AIs you have made." actions={<Link href="/agents/new"><Button size="lg"><Plus />Make a new AI</Button></Link>} />
      {agents === null ? (
        <div className="grid h-48 place-items-center"><Spinner className="h-6 w-6 text-accent" /></div>
      ) : agents.length === 0 ? (
        <EmptyState icon={<Bot className="h-6 w-6" />} title="You don't have an AI yet" text="Make your first one. Just say what you want it to do." action={<Link href="/agents/new"><Button size="xl"><Plus />Make my first AI</Button></Link>} />
      ) : (
        <>
          <div className="relative mb-5 max-w-sm"><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" /><Input className="pl-10" placeholder="Find an AI by name" aria-label="Find an AI by name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shown.map((a) => <AgentCard key={a.id} agent={a} onChange={load} />)}</div>
          {shown.length === 0 && <p className="text-base text-muted">No AI has a name like “{q}”. Try a different word.</p>}
        </>
      )}
    </div>
  );
}
