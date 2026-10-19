"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Lock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/misc";
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
      toast("error", "We couldn't make this AI. Please try again in a moment.");
      setBusy(null);
    }
  };
  return (
    <div>
      <PageHeader title="Ready-made AIs" subtitle="Pick one to start with. You can change anything about it afterwards." />
      {!items ? <Spinner className="text-accent" /> : items.length === 0 ? (
        <EmptyState icon={<Bot className="h-6 w-6" />} title="No ready-made AIs right now" text="You can make your own instead. Just say what you want it to do." action={<Link href="/agents/new"><Button size="xl"><Plus />Make my own AI</Button></Link>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => {
            const Icon = iconFor(t.icon);
            return (
              <div key={t.id} className={`flex flex-col rounded-2xl border border-line bg-card p-5 shadow-soft ${t.available ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent"><Icon className="h-5 w-5" /></span>
                  {!t.available && <Badge tone="warn"><Lock className="h-3 w-3" />Not ready yet</Badge>}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{t.name}</h3>
                <p className="mt-1 flex-1 text-base text-muted">{t.description}</p>
                {t.available ? (
                  <Button className="mt-4" variant="secondary" onClick={() => use(t)} disabled={busy !== null}>{busy === t.id && <Spinner />}Start with this one</Button>
                ) : (
                  <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2 text-base text-warn">{t.unavailable_reason}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
