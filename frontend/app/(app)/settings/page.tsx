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
    try { await api("/api/auth/me", { method: "PATCH", json: { display_name: name } }); await refresh(); toast("ok", "Your name is saved."); }
    catch { toast("error", "We couldn't save your name. Please try again."); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Your name, how the screen looks, and your AI brain." />
      <Card>
        <CardHeader><CardTitle>About you</CardTitle><CardDescription>Your email address: {user?.email}</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-72"><Label htmlFor="dn">Your name</Label><Input id="dn" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button onClick={save}>Save my name</Button>
          <Button variant="ghost" onClick={signOut} className="ml-auto">Sign out</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>How the screen looks</CardTitle></CardHeader>
        <CardContent><Button variant="secondary" onClick={toggle}>{theme === "dark" ? <Sun /> : <Moon />}{theme === "dark" ? "Use a light screen" : "Use a dark screen"}</Button></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between"><CardTitle>AI brain</CardTitle><Button variant="ghost" onClick={loadProviders}><RefreshCw />Check again</Button></div>
          <CardDescription>Your AI thinks using the free AI program (Ollama) on your own computer. Nothing is sent to other companies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!providers ? <p className="text-base text-muted">Checking…</p> : providers.map((p) => (
            <div key={p.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                {p.available ? <CircleCheck className="h-5 w-5 text-ok" aria-label="Working" /> : <CircleX className="h-5 w-5 text-muted" aria-label="Not working yet" />}
                <span className="text-lg font-medium">{p.id === "ollama" ? "The free AI program (Ollama)" : p.name}</span>
                {!p.implemented && <Badge>Coming later</Badge>}
                {!p.is_generative_ai && <Badge tone="warn">Simple answers only</Badge>}
                {p.kind === "local" && <Badge tone="blue">Free and private</Badge>}
              </div>
              <p className="mt-1 text-base text-muted">{p.description}</p>
              <p className="mt-1 text-base text-muted">{p.status_message}</p>
              {p.id === "ollama" && !p.available && (
                <div className="mt-3 rounded-lg bg-bg/70 p-4 text-base leading-relaxed">
                  <div className="mb-2 flex items-center gap-2 font-medium"><Terminal className="h-5 w-5" />The free AI program is not on this computer yet. To set it up (you only do this once):</div>
                  <ol className="list-decimal space-y-1 pl-6">
                    <li>Go to ollama.com and install the program.</li>
                    <li>Open the Terminal app and type: <code className="font-mono">ollama pull llama3.2</code></li>
                    <li>If you want it to search your documents better, also type: <code className="font-mono">ollama pull nomic-embed-text</code></li>
                    <li>Come back here and press &quot;Check again&quot;.</li>
                  </ol>
                  <p className="mt-2 text-muted">If this sounds hard, ask a family member or friend to help.</p>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      {runtime && (
        <Card>
          <CardHeader><CardTitle>Limits</CardTitle><CardDescription>These are set for you. You don&apos;t need to change them.</CardDescription></CardHeader>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-base font-medium">More details</summary>
              <div className="mt-3 grid gap-2 text-base sm:grid-cols-2">
                <span>Most steps in one AI: <b>{runtime.max_nodes}</b></span>
                <span>Longest time to answer: <b>{runtime.run_timeout_seconds} seconds</b></span>
                <span>Most times the AI brain is asked per question: <b>{runtime.max_ai_calls_per_run}</b></span>
                <span>Questions answered at the same time: <b>{runtime.max_concurrent_runs}</b></span>
                <span>Biggest document you can add: <b>{runtime.max_upload_mb} MB</b></span>
                <span>Sign-in: <b>{runtime.auth_mode === "local" ? "Built-in accounts" : "Supabase"}</b></span>
              </div>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
