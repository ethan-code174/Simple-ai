"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, Bot, CircleCheck, CircleX, Coins, Globe, Plus, UserCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/misc";
import { AgentCard } from "@/features/agents/agent-card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, timeAgo } from "@/lib/utils";
import { statusLabel, statusTone } from "@/lib/status";
import type { AgentSummary } from "@/types";

type Dash = {
  totals: { agents: number; active_agents: number; executions: number; succeeded: number; failed: number; cost_usd: number; pending_approvals: number; prompt_tokens: number; completion_tokens: number };
  month: { executions: number; cost_usd: number };
  recent_agents: AgentSummary[];
  recent_activity: { id: string; agent_id: string; agent_name: string; status: string; source: string; message: string; created_at: string }[];
};


export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api<Dash>("/api/dashboard").then(setData).catch(() => setError("We couldn't load your page. Please refresh the page to try again.")), []);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-lg text-bad">{error}</p>;
  if (!data) return <div className="grid h-64 place-items-center"><Spinner className="h-6 w-6 text-accent" /></div>;
  const t = data.totals;
  const stats = [
    { label: "My AIs", value: t.agents, icon: Bot },
    { label: "Shared with others", value: t.active_agents, icon: Globe },
    { label: "Questions answered", value: t.succeeded, icon: Activity, sub: t.failed > 0 ? `${t.failed} didn't work` : undefined },
    { label: "Cost", value: t.cost_usd === 0 ? "Free" : money(t.cost_usd), icon: Coins, sub: t.cost_usd === 0 ? "Your AI runs on your own computer" : "An estimate" },
  ];

  return (
    <div>
      <PageHeader
        title={`Hello, ${user?.display_name || "there"}`}
        subtitle="Here is how your AIs are doing."
        actions={<Link href="/agents/new"><Button size="lg"><Plus />Make a new AI</Button></Link>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, sub }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center justify-between text-base text-muted">{label}<Icon className="h-5 w-5" /></div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
            {sub && <div className="mt-1 text-base text-muted">{sub}</div>}
          </Card>
        ))}
      </div>

      {t.pending_approvals > 0 && (
        <Link href="/approvals" className="mt-4 flex items-center gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-5 py-4 text-lg hover:bg-warn/15">
          <UserCheck className="h-5 w-5 text-warn" />
          <span><b>{t.pending_approvals}</b> {t.pending_approvals > 1 ? "answers are" : "answer is"} waiting for you to check.</span>
          <span className="ml-auto font-medium text-warn">Check now →</span>
        </Link>
      )}

      {t.agents === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Bot className="h-6 w-6" />}
            title="You don't have an AI yet"
            text="Tell us in your own words what you want it to do. We will make it for you. It takes about a minute."
            action={<div className="flex flex-col items-center gap-3"><Link href="/agents/new"><Button size="xl"><Plus />Make my first AI</Button></Link><Link href="/templates" className="text-base text-accent underline">Or start from a ready-made AI</Link></div>}
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">Your latest AIs</h2><Link href="/agents" className="text-base text-accent underline">See all my AIs</Link></div>
            <div className="grid gap-4 sm:grid-cols-2">{data.recent_agents.slice(0, 4).map((a) => <AgentCard key={a.id} agent={a} onChange={load} />)}</div>
          </div>
          <Card>
            <CardHeader><CardTitle>Latest questions</CardTitle></CardHeader>
            <CardContent>
              {data.recent_activity.length === 0 ? (
                <p className="py-8 text-center text-base text-muted">No questions yet. Open one of your AIs and try asking it something.</p>
              ) : (
                <ul className="space-y-3">
                  {data.recent_activity.map((r) => (
                    <li key={r.id} className="flex items-start gap-3 text-base">
                      {r.status === "succeeded" ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : r.status === "failed" ? <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-bad" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}
                      <div className="min-w-0 flex-1">
                        <Link href={`/agents/${r.agent_id}`} className="font-medium hover:text-accent">{r.agent_name}</Link>
                        <p className="truncate text-muted">“{r.message}”</p>
                      </div>
                      <div className="text-right text-sm text-muted">
                        <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                        <div className="mt-1">{r.source === "public" ? "From a visitor" : r.source === "test" ? "A check" : "You tried it"} · {timeAgo(r.created_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
