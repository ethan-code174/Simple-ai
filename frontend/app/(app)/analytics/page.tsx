"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { money, ms } from "@/lib/utils";

type Stats = { executions: number; succeeded: number; failed: number; waiting: number; avg_duration_ms: number | null; prompt_tokens: number; completion_tokens: number; cost_usd: number };
type Data = { totals: Stats; series: { date: string; executions: number; failed: number }[]; per_agent: ({ agent_id: string; name: string } & Stats)[] };

export default function AnalyticsPage() {
  const [agent, setAgent] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { api("/api/agents").then(setAgents); }, []);
  useEffect(() => { setData(null); api<Data>(`/api/analytics${agent ? `?agent_id=${agent}` : ""}`).then(setData); }, [agent]);
  const max = Math.max(1, ...(data?.series.map((s) => s.executions) ?? [1]));
  const t = data?.totals;
  const cost = (n: number) => (n === 0 ? "Free" : money(n));
  return (
    <div>
      <PageHeader title="How it's going" subtitle="How many questions your AIs have answered."
        actions={<Select value={agent} onChange={(e) => setAgent(e.target.value)} className="w-64" aria-label="Show which AI"><option value="">All my AIs</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>} />
      {!data || !t ? <Spinner className="text-accent" /> : t.executions === 0 ? (
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Nothing to show yet" text="Open one of your AIs and ask it a question. Then come back here to see how it's going."
          action={<Link href="/agents"><Button size="xl">Go to my AIs</Button></Link>} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[["Conversations", t.executions], ["Answered", t.succeeded], ["Didn't work", t.failed], ["Time to answer", ms(t.avg_duration_ms)]].map(([l, v]) => (
              <Card key={l as string} className="p-5"><div className="text-base text-muted">{l}</div><div className="mt-1 text-3xl font-semibold">{v}</div></Card>
            ))}
          </div>
          <Card className="mt-6">
            <CardHeader><CardTitle>Conversations each day (last 2 weeks)</CardTitle></CardHeader>
            <CardContent>
              <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Chart of conversations each day for the last 2 weeks">
                {data.series.map((s) => (
                  <div key={s.date} className="group relative flex flex-1 flex-col items-center justify-end" title={`${s.date}: ${s.executions} conversations, ${s.failed} didn't work`}>
                    <div className="w-full rounded-t-md bg-accent/70 transition-colors group-hover:bg-accent" style={{ height: `${(s.executions / max) * 100}%`, minHeight: s.executions ? 4 : 0 }} />
                    <span className="mt-1 text-sm text-muted">{s.date.slice(8)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="mt-6 overflow-x-auto">
            <table className="w-full text-base">
              <thead className="text-left text-sm text-muted"><tr className="border-b border-line">{["AI", "Conversations", "Answered", "Didn't work", "Waiting for you", "Time to answer"].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>{data.per_agent.map((a) => (
                <tr key={a.agent_id} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-3 font-medium">{a.name}</td><td className="px-5">{a.executions}</td><td className="px-5 text-ok">{a.succeeded}</td><td className="px-5 text-bad">{a.failed}</td><td className="px-5">{a.waiting}</td><td className="px-5">{ms(a.avg_duration_ms)}</td>
                </tr>))}</tbody>
            </table>
          </Card>
          <details className="mt-6 rounded-lg border border-line bg-card p-5">
            <summary className="cursor-pointer text-lg font-medium">More details</summary>
            <p className="mt-3 text-base">Cost: {cost(t.cost_usd)}</p>
            <p className="mt-1 text-base text-muted">Amount of text the AI read and wrote: {(t.prompt_tokens + t.completion_tokens).toLocaleString()} pieces</p>
            <ul className="mt-3 space-y-1 text-base text-muted">
              {data.per_agent.map((a) => <li key={a.agent_id}>{a.name}: {cost(a.cost_usd)}, {(a.prompt_tokens + a.completion_tokens).toLocaleString()} pieces of text</li>)}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
