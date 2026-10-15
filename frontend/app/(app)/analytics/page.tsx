"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
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
  return (
    <div>
      <PageHeader title="Analytics" subtitle="Real numbers from your agents' runs. Nothing here is estimated except AI cost."
        actions={<Select value={agent} onChange={(e) => setAgent(e.target.value)} className="w-56" aria-label="Agent"><option value="">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>} />
      {!data || !t ? <Spinner className="text-accent" /> : t.executions === 0 ? (
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No usage yet" text="Once you test or publish an agent, you'll see how many conversations it handled, how fast it was and what it cost." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[["Runs", t.executions], ["Answered", t.succeeded], ["Failed", t.failed], ["Avg. time", ms(t.avg_duration_ms)], ["Tokens", (t.prompt_tokens + t.completion_tokens).toLocaleString()], ["Est. cost", money(t.cost_usd)]].map(([l, v]) => (
              <Card key={l as string} className="p-4"><div className="text-xs text-muted">{l}</div><div className="mt-1 text-2xl font-semibold">{v}</div></Card>
            ))}
          </div>
          <Card className="mt-6">
            <CardHeader><CardTitle>Runs per day (last 14 days)</CardTitle></CardHeader>
            <CardContent>
              <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Runs per day bar chart">
                {data.series.map((s) => (
                  <div key={s.date} className="group relative flex flex-1 flex-col items-center justify-end" title={`${s.date}: ${s.executions} runs, ${s.failed} failed`}>
                    <div className="w-full rounded-t-md bg-gradient-to-t from-accent/70 to-accent2/70 transition group-hover:brightness-125" style={{ height: `${(s.executions / max) * 100}%`, minHeight: s.executions ? 4 : 0 }} />
                    <span className="mt-1 text-[10px] text-muted">{s.date.slice(8)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr className="border-b border-line">{["Agent", "Runs", "Answered", "Failed", "Waiting", "Avg. time", "Tokens", "Est. cost"].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>{data.per_agent.map((a) => (
                <tr key={a.agent_id} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-3 font-medium">{a.name}</td><td className="px-5">{a.executions}</td><td className="px-5 text-ok">{a.succeeded}</td><td className="px-5 text-bad">{a.failed}</td><td className="px-5">{a.waiting}</td><td className="px-5">{ms(a.avg_duration_ms)}</td><td className="px-5">{(a.prompt_tokens + a.completion_tokens).toLocaleString()}</td><td className="px-5">{money(a.cost_usd)}</td>
                </tr>))}</tbody>
            </table>
          </Card>
          <p className="mt-4 text-xs text-muted">Coming later: satisfaction ratings, unanswered questions and improvement suggestions.</p>
        </>
      )}
    </div>
  );
}
