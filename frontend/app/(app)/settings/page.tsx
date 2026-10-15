"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleX, Moon, RefreshCw, Sun, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/lib/toast";
import type { Provider } from "@/types";

export default function SettingsPage() {
  const { user, refresh, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const [name, setName] = useState(user?.display_name ?? "");
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [runtime, setRuntime] = useState<any>(null);
  const loadProviders = () => { setProviders(null); api<Provider[]>("/api/providers").then(setProviders); };
  useEffect(() => { loadProviders(); api("/api/settings/runtime").then(setRuntime); }, []);

  const save = async () => {
    try { await api("/api/auth/me", { method: "PATCH", json: { display_name: name } }); await refresh(); toast("ok", "Profile saved"); }
    catch (e: any) { toast("error", e.message); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Your profile, appearance and AI models." />
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle><CardDescription>{user?.email}</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-72"><Label htmlFor="dn">Display name</Label><Input id="dn" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button onClick={save}>Save</Button>
          <Button variant="ghost" onClick={signOut} className="ml-auto">Sign out</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
        <CardContent><Button variant="secondary" onClick={toggle}>{theme === "dark" ? <Sun /> : <Moon />}Switch to {theme === "dark" ? "light" : "dark"} mode</Button></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between"><CardTitle>AI models</CardTitle><Button variant="ghost" size="sm" onClick={loadProviders}><RefreshCw />Check again</Button></div>
          <CardDescription>This version runs AI on your own computer with Ollama. No AI company APIs are used.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!providers ? <p className="text-sm text-muted">Checking…</p> : providers.map((p) => (
            <div key={p.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                {p.available ? <CircleCheck className="h-4 w-4 text-ok" /> : <CircleX className="h-4 w-4 text-muted" />}
                <span className="font-medium">{p.name}</span>
                {!p.implemented && <Badge>Coming later</Badge>}
                {!p.is_generative_ai && <Badge tone="warn">Not AI</Badge>}
                {p.kind === "local" && <Badge tone="blue">Free · Private</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted">{p.description}</p>
              <p className="mt-1 text-xs text-muted">{p.status_message}</p>
              {p.id === "ollama" && !p.available && (
                <div className="mt-3 rounded-lg bg-bg/70 p-3 font-mono text-xs leading-relaxed">
                  <div className="mb-1 flex items-center gap-1.5 font-sans text-muted"><Terminal className="h-3.5 w-3.5" />Set up a free local model (one time):</div>
                  1. Install Ollama from https://ollama.com<br />2. ollama pull llama3.2<br />3. (optional, better document search) ollama pull nomic-embed-text
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      {runtime && (
        <Card>
          <CardHeader><CardTitle>Safety limits</CardTitle><CardDescription>Set by the server administrator.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <span>Blocks per workflow: <b>{runtime.max_nodes}</b></span>
            <span>Max time per run: <b>{runtime.run_timeout_seconds}s</b></span>
            <span>AI calls per run: <b>{runtime.max_ai_calls_per_run}</b></span>
            <span>Runs at once: <b>{runtime.max_concurrent_runs}</b></span>
            <span>Max upload size: <b>{runtime.max_upload_mb} MB</b></span>
            <span>Sign-in: <b>{runtime.auth_mode === "local" ? "Built-in accounts" : "Supabase"}</b></span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
