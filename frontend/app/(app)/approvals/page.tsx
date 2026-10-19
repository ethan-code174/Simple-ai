"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { timeAgo } from "@/lib/utils";
import type { Approval } from "@/types";

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[] | null>(null);
  const toast = useToast();
  const load = useCallback(() => api<Approval[]>("/api/approvals").then(setItems), []);
  useEffect(() => { load(); }, [load]);
  const decide = async (id: string, decision: "approved" | "rejected") => {
    try {
      const r = await api(`/api/approvals/${id}/decide`, { method: "POST", json: { decision } });
      toast(r.status === "failed" ? "error" : "ok", decision === "approved" ? (r.status === "failed" ? "You said yes, but the AI couldn't send the answer. Please try asking it again." : "Done. The answer was sent.") : "Done. The answer was not sent.");
      load();
    } catch { toast("error", "That didn't work. Please refresh the page and try again."); }
  };
  return (
    <div>
      <PageHeader title="Waiting for you" subtitle="Check these answers before they're sent." />
      {!items ? <Spinner className="text-accent" /> : items.length === 0 ? (
        <EmptyState icon={<UserCheck className="h-6 w-6" />} title="Nothing is waiting for you" text="If one of your AIs needs you to check an answer first, it will show up here." action={<Link href="/dashboard"><Button size="xl">Go back to my home page</Button></Link>} />
      ) : (
        <div className="space-y-3">{items.map((a) => (
          <Card key={a.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/agents/${a.agent_id}`} className="text-lg font-semibold hover:text-accent">{a.agent_name}</Link>
                <span className="ml-2 text-base text-muted">{timeAgo(a.created_at)}</span>
                <p className="mt-2 whitespace-pre-wrap text-base">{a.summary}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="success" onClick={() => decide(a.id, "approved")}><Check />Yes, send it</Button>
                <Button variant="secondary" onClick={() => { if (window.confirm("Don't send this answer?")) decide(a.id, "rejected"); }}><X />No, don't send it</Button>
              </div>
            </div>
          </Card>))}
        </div>
      )}
    </div>
  );
}
