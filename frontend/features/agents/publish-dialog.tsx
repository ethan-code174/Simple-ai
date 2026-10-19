"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { AgentDetail, Validation } from "@/types";

const EMOJIS = ["🤖", "🔧", "💬", "🏠", "🍰", "💇", "🦷", "📚", "🛠️", "🌿", "⚡", "🐾"];

export function PublishDialog({ open, onClose, agent, validation, beforePublish, onUpdated }: {
  open: boolean; onClose: () => void; agent: AgentDetail; validation: Validation | null;
  beforePublish: () => Promise<void>; onUpdated: (a: AgentDetail) => void;
}) {
  const pub = agent.publication;
  const [form, setForm] = useState({ display_name: "", description: "", welcome_message: "", avatar_emoji: "🤖", accent_color: "#3f8f84", slug: "" });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    setForm({
      display_name: pub?.display_name ?? agent.name, description: pub?.description ?? agent.description.slice(0, 1000),
      welcome_message: pub?.welcome_message ?? `Hi! I'm ${agent.name}. How can I help you today?`,
      avatar_emoji: pub?.avatar_emoji ?? "🤖", accent_color: pub?.accent_color ?? "#3f8f84", slug: pub?.slug ?? "",
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const errors = validation?.issues.filter((i) => i.severity === "error") ?? [];
  const url = pub ? `${typeof window !== "undefined" ? window.location.origin : ""}/a/${pub.slug}` : "";

  const save = async (andPublish: boolean) => {
    setBusy(true);
    try {
      await beforePublish();
      let a = await api<AgentDetail>(`/api/agents/${agent.id}/publication`, { method: "PUT", json: { ...form, slug: form.slug || null } });
      if (andPublish) a = await api<AgentDetail>(`/api/agents/${agent.id}/publish`, { method: "POST" });
      onUpdated(a);
      toast("ok", andPublish ? "Your agent is live!" : "Settings saved");
    } catch (e: any) {
      toast("error", e.detail?.issues ? `${e.message} ${e.detail.issues[0].message}` : e.message);
    } finally { setBusy(false); }
  };
  const unpublish = async () => {
    const a = await api<AgentDetail>(`/api/agents/${agent.id}/unpublish`, { method: "POST" });
    onUpdated(a);
    toast("ok", "Agent unpublished. The link no longer works.");
  };

  return (
    <Dialog open={open} onClose={onClose} title="Publish your agent" description="Get a chat page anyone can use. Visitors can chat, but never see or edit your workflow." className="max-w-xl">
      {pub?.is_live && (
        <div className="mb-5 rounded-xl border border-ok/40 bg-ok/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ok"><Globe className="h-4 w-4" />Live · version {pub.version}</div>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={url} data-testid="public-url" onFocus={(e) => e.target.select()} />
            <Button variant="secondary" size="icon" className="h-9 w-9 shrink-0" aria-label="Copy link" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check /> : <Copy />}</Button>
            <a href={url} target="_blank" rel="noreferrer"><Button variant="secondary" size="icon" className="h-9 w-9" aria-label="Open public page"><ExternalLink /></Button></a>
          </div>
          <p className="mt-2 text-xs text-muted">Changes you make in the editor go live only when you publish again.</p>
        </div>
      )}
      {errors.length > 0 && (
        <div className="mb-4 rounded-xl bg-bad/10 p-3 text-sm text-bad">
          <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />Fix these before publishing:</div>
          <ul className="mt-1 list-disc pl-6 text-xs">{errors.slice(0, 4).map((e, i) => <li key={i}>{e.message}</li>)}</ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} maxLength={120} /></div>
        <div className="sm:col-span-2"><Label>Short description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} /></div>
        <div className="sm:col-span-2"><Label>Welcome message</Label><Textarea rows={2} value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} /></div>
        <div>
          <Label>Avatar</Label>
          <div className="flex flex-wrap gap-1">{EMOJIS.map((em) => <button key={em} type="button" onClick={() => setForm({ ...form, avatar_emoji: em })} className={`grid h-8 w-8 place-items-center rounded-lg text-lg ${form.avatar_emoji === em ? "bg-accent/20 ring-1 ring-accent" : "hover:bg-line/50"}`}>{em}</button>)}</div>
        </div>
        <div>
          <Label>Colour</Label>
          <div className="flex items-center gap-2"><input type="color" aria-label="Accent colour" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-line bg-transparent" /><span className="text-xs text-muted">{form.accent_color}</span></div>
        </div>
        <div className="sm:col-span-2">
          <Label>Link (optional)</Label>
          <div className="flex items-center gap-1 text-sm text-muted"><span className="shrink-0">/a/</span><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="my-plumbing-helper" maxLength={60} /></div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {pub?.is_live && <Button variant="ghost" className="mr-auto text-bad" onClick={unpublish}>Unpublish</Button>}
        <Button variant="secondary" onClick={() => save(false)} disabled={busy}>Save settings</Button>
        <Button onClick={() => save(true)} disabled={busy || errors.length > 0} data-testid="publish-confirm">{busy && <Spinner />}{pub?.is_live ? "Publish changes" : "Publish now"}</Button>
      </div>
    </Dialog>
  );
}
