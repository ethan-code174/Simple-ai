"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PageHeader, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { money } from "@/lib/utils";

type Plan = { id: string; name: string; price_label: string; monthly_executions: number; max_agents: number; max_documents: number; max_published: number };
type Billing = { plan: Plan; usage: { executions: number; cost_usd: number }; monthly_spend_limit_usd: number; plans: Plan[]; usage_warning: string | null; stripe_configured: boolean; stripe_note: string };

export default function BillingPage() {
  const [b, setB] = useState<Billing | null>(null);
  const [limit, setLimit] = useState("");
  const toast = useToast();
  useEffect(() => { api<Billing>("/api/billing").then((d) => { setB(d); setLimit(String(d.monthly_spend_limit_usd)); }); }, []);
  if (!b) return <Spinner className="text-accent" />;
  const pct = Math.min(100, (b.usage.executions / b.plan.monthly_executions) * 100);
  const saveLimit = async () => {
    try { await api("/api/billing/limits", { method: "PATCH", json: { monthly_spend_limit_usd: Number(limit) } }); toast("ok", "Spending limit saved"); }
    catch (e: any) { toast("error", e.message); }
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Billing" subtitle="Your plan, usage and spending limits." />
      {b.usage_warning && <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">{b.usage_warning}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{b.plan.name} plan</CardTitle><CardDescription>{b.plan.price_label}</CardDescription></CardHeader>
          <CardContent>
            <div className="flex justify-between text-sm"><span>Runs this month</span><span>{b.usage.executions} / {b.plan.monthly_executions.toLocaleString()}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
            <p className="mt-4 text-sm text-muted">Estimated AI cost this month: <b className="text-fg">{money(b.usage.cost_usd)}</b> (local models are free)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Spending limit</CardTitle><CardDescription>Runs stop when estimated AI cost reaches this amount. Applies once paid AI providers are added.</CardDescription></CardHeader>
          <CardContent className="flex items-end gap-3">
            <div className="w-40"><Label htmlFor="lim">Monthly limit (USD)</Label><Input id="lim" type="number" min={0} step="1" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
            <Button variant="secondary" onClick={saveLimit}>Save</Button>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {b.plans.map((p) => (
          <Card key={p.id} className={`p-5 ${p.id === b.plan.id ? "border-accent" : ""}`}>
            <div className="flex items-center justify-between"><h3 className="font-semibold">{p.name}</h3>{p.id === b.plan.id && <Badge tone="accent">Current</Badge>}</div>
            <p className="mt-1 text-lg font-semibold">{p.price_label}</p>
            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              {[`${p.monthly_executions.toLocaleString()} runs / month`, `${p.max_agents} agents`, `${p.max_documents} documents`, `${p.max_published} published agents`].map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-ok" />{f}</li>)}
            </ul>
            {p.id !== b.plan.id && <Button className="mt-5 w-full" variant="secondary" disabled title={b.stripe_note}>Upgrade</Button>}
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted">{b.stripe_note}</p>
    </div>
  );
}
