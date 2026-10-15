"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { iconFor } from "@/lib/icons";
import { useToast } from "@/lib/toast";

type Template = { id: string; name: string; icon: string; description: string; available: boolean; unavailable_reason?: string };

export default function TemplatesPage() {
  const [items, setItems] = useState<Template[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  useEffect(() => { api<Template[]>("/api/templates").then(setItems); }, []);
  const use = async (t: Template) => {
    setBusy(t.id);
    try {
      const a = await api<{ id: string }>(`/api/agents/from-template/${t.id}`, { method: "POST" });
      router.push(`/agents/${a.id}`);
    } catch (e: any) {
      toast("error", e.message);
      setBusy(null);
    }
  };
  return (
    <div>
      <PageHeader title="Templates" subtitle="Start from a ready-made agent, then make it yours. Every template is fully editable." />
      {!items ? <Spinner className="text-accent" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => {
            const Icon = iconFor(t.icon);
            return (
              <div key={t.id} className={`flex flex-col rounded-2xl border border-line bg-card p-5 shadow-soft ${t.available ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent"><Icon className="h-5 w-5" /></span>
                  {!t.available && <Badge tone="warn"><Lock className="h-3 w-3" />Unavailable</Badge>}
                </div>
                <h3 className="mt-4 font-semibold">{t.name}</h3>
                <p className="mt-1 flex-1 text-sm text-muted">{t.description}</p>
                {t.available ? (
                  <Button className="mt-4" variant="secondary" onClick={() => use(t)} disabled={busy !== null}>{busy === t.id && <Spinner />}Use this template</Button>
                ) : (
                  <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">{t.unavailable_reason}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
