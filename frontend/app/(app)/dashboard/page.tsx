"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, Bot, CircleCheck, CircleX, Coins, Globe, Plus, Sparkles, UserCheck, Clock } from "lucide-react";
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
  const load = useCallback(() => api<Dash>("/api/dashboard").then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-bad">{error}</p>;
  if (!data) return <div className="grid h-64 place-items-center"><Spinner className="h-6 w-6 text-accent" /></div>;
  const t = data.totals;
  const stats = [
    { label: "Total agents", value: t.agents, icon: Bot },
    { label: "Live agents", value: t.active_agents, icon: Globe },
    { label: "Agent runs", value: t.executions, icon: Activity, sub: `${t.succeeded} answered · ${t.failed} failed` },
    { label: "Estimated AI cost", value: money(t.cost_usd), icon: Coins, sub: "Local models are free" },
  ];

  return (
    <div>
      <PageHeader
        title={`Hi ${user?.display_name || "there"} 👋`}
        subtitle="Here's what your AI agents have been up to."
        actions={<Link href="/agents/new"><Button size="lg"><Plus />Create New Agent</Button></Link>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, sub }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center justify-between text-sm text-muted">{label}<Icon className="h-4 w-4" /></div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
            {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
          </Card>
        ))}
      </div>

      {t.pending_approvals > 0 && (
        <Link href="/approvals" className="mt-4 flex items-center gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-5 py-3 text-sm hover:bg-warn/15">
          <UserCheck className="h-4 w-4 text-warn" />
          <span><b>{t.pending_approvals}</b> conversation{t.pending_approvals > 1 ? "s are" : " is"} waiting for your approval.</span>
          <span className="ml-auto text-warn">Review →</span>
        </Link>
      )}

      {t.agents === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="Create your first AI agent"
            text="Describe what you want in plain English and The Architect will build it for you. It takes about a minute."
            action={<div className="flex gap-2"><Link href="/agents/new"><Button><Plus />Create agent</Button></Link><Link href="/templates"><Button variant="secondary">Use a template</Button></Link></div>}
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Recently edited</h2><Link href="/agents" className="text-sm text-accent hover:underline">All agents</Link></div>
            <div className="grid gap-4 sm:grid-cols-2">{data.recent_agents.slice(0, 4).map((a) => <AgentCard key={a.id} agent={a} onChange={load} />)}</div>
          </div>
          <Card>
            <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
            <CardContent>
              {data.recent_activity.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No runs yet. Test an agent to see activity here.</p>
              ) : (
                <ul className="space-y-3">
                  {data.recent_activity.map((r) => (
                    <li key={r.id} className="flex items-start gap-3 text-sm">
                      {r.status === "succeeded" ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : r.status === "failed" ? <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-bad" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}
                      <div className="min-w-0 flex-1">
                        <Link href={`/agents/${r.agent_id}`} className="font-medium hover:text-accent">{r.agent_name}</Link>
                        <p className="truncate text-muted">“{r.message}”</p>
                      </div>
                      <div className="text-right text-xs text-muted">
                        <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                        <div className="mt-1">{r.source === "public" ? "Public" : r.source === "test" ? "Auto test" : "Playground"} · {timeAgo(r.created_at)}</div>
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
