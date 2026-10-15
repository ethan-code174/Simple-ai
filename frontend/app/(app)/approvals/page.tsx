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
      toast(r.status === "failed" ? "error" : "ok", decision === "approved" ? (r.status === "failed" ? `Approved, but the agent failed: ${r.error?.message}` : "Approved. The agent finished its reply.") : "Rejected.");
      load();
    } catch (e: any) { toast("error", e.message); }
  };
  return (
    <div>
      <PageHeader title="Waiting for approval" subtitle="Conversations your agents paused for a human decision." />
      {!items ? <Spinner className="text-accent" /> : items.length === 0 ? (
        <EmptyState icon={<UserCheck className="h-6 w-6" />} title="Nothing waiting" text="When an agent's Human Approval block pauses a conversation, it shows up here." />
      ) : (
        <div className="space-y-3">{items.map((a) => (
          <Card key={a.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/agents/${a.agent_id}`} className="font-semibold hover:text-accent">{a.agent_name}</Link>
                <span className="ml-2 text-xs text-muted">{timeAgo(a.created_at)}</span>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{a.summary}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="success" size="sm" onClick={() => decide(a.id, "approved")}><Check />Approve</Button>
                <Button variant="secondary" size="sm" onClick={() => decide(a.id, "rejected")}><X />Reject</Button>
              </div>
            </div>
          </Card>))}
        </div>
      )}
    </div>
  );
}
