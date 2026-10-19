"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleX, History, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { timeAgo } from "@/lib/utils";

type Version = { version: number; note: string; created_at: string; blocks: number };

export function VersionsPanel({ agentId, refreshKey, onRestore }: { agentId: string; refreshKey: number; onRestore: (v: number) => Promise<void> }) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  useEffect(() => { api<Version[]>(`/api/agents/${agentId}/versions`).then(setVersions); }, [agentId, refreshKey]);
  return (
    <div className="h-full overflow-y-auto p-4">
      <h3 className="font-semibold">Version history</h3>
      <p className="mt-1 text-xs text-muted">Every saved version can be restored. Restoring creates a new version, so nothing is lost.</p>
      <div className="mt-4 space-y-2">
        {!versions ? <Spinner /> : versions.map((v, i) => (
          <div key={v.version} className="flex items-start gap-3 rounded-xl border border-line p-3">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Version {v.version} {i === 0 && <span className="text-xs text-accent">· latest</span>}</div>
              <div className="truncate text-xs text-muted" title={v.note}>{v.note || "Saved"}</div>
              <div className="text-xs text-muted">{timeAgo(v.created_at)} · {v.blocks} blocks</div>
            </div>
            {i !== 0 && <Button size="sm" variant="ghost" onClick={() => onRestore(v.version)}><RotateCcw />Restore</Button>}
          </div>
        ))}
      </div>
    </div>
  );
}

type TestCase = { id: string; input_text: string; assertion: string; expected: string; last_result: { passed: boolean; detail: string; reply: string } | null };
const CHECKS = [
  { value: "contains", label: "Reply contains", needs: "text" },
  { value: "not_contains", label: "Reply does not contain", needs: "text" },
  { value: "uses_documents", label: "Uses my documents", needs: "optional file name" },
  { value: "max_length", label: "Reply is shorter than (characters)", needs: "number" },
  { value: "equals", label: "Reply is exactly", needs: "text" },
  { value: "succeeds", label: "Runs without errors", needs: "" },
];

export function TestsPanel({ agentId, beforeRun }: { agentId: string; beforeRun: () => Promise<void> }) {
  const [tests, setTests] = useState<TestCase[]>([]);
  const [form, setForm] = useState({ input_text: "", assertion: "contains", expected: "" });
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const toast = useToast();
  const load = useCallback(() => api<TestCase[]>(`/api/agents/${agentId}/tests`).then(setTests), [agentId]);
  useEffect(() => { load(); }, [load]);
  const check = CHECKS.find((c) => c.value === form.assertion)!;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api(`/api/agents/${agentId}/tests`, { method: "POST", json: form }); setForm({ ...form, input_text: "", expected: "" }); load(); }
    catch (err: any) { toast("error", err.message); }
  };
  const runAll = async () => {
    setRunning(true);
    try {
      await beforeRun();
      const r = await api(`/api/agents/${agentId}/tests/run`, { method: "POST" });
      setTests(r.results);
      setSummary(`${r.passed} of ${r.total} passed. ${r.note}`);
    } catch (err: any) { toast("error", err.message); } finally { setRunning(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h3 className="font-semibold">Automatic tests</h3>
      <p className="mt-1 text-xs text-muted">Save example questions and what a good answer must include. Run them after every change.</p>
      <form onSubmit={add} className="mt-4 space-y-3 rounded-xl border border-line p-3">
        <div><Label>When someone says</Label><Input value={form.input_text} onChange={(e) => setForm({ ...form, input_text: e.target.value })} placeholder="What are your opening hours?" required /></div>
        <div><Label>Check that</Label><Select value={form.assertion} onChange={(e) => setForm({ ...form, assertion: e.target.value })}>{CHECKS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></div>
        {check.needs && <div><Label>Expected ({check.needs})</Label><Input value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} placeholder={check.value === "contains" ? "7am" : ""} /></div>}
        <Button size="sm" variant="secondary" className="w-full"><Plus />Add test</Button>
      </form>
      {tests.length > 0 && (
        <>
          <Button className="mt-4 w-full" onClick={runAll} disabled={running}>{running ? <Spinner /> : <Play />}Run {tests.length} test{tests.length > 1 ? "s" : ""}</Button>
          {summary && <p className="mt-2 text-xs text-muted">{summary}</p>}
          <div className="mt-3 space-y-2">
            {tests.map((t) => (
              <div key={t.id} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex items-start gap-2">
                  {t.last_result ? (t.last_result.passed ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-bad" />) : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-line" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">“{t.input_text}”</div>
                    <div className="text-xs text-muted">{CHECKS.find((c) => c.value === t.assertion)?.label} {t.expected && `“${t.expected}”`}</div>
                    {t.last_result && <div className={`mt-1 text-xs ${t.last_result.passed ? "text-ok" : "text-bad"}`}>{t.last_result.detail}</div>}
                  </div>
                  <button aria-label="Delete test" onClick={async () => { await api(`/api/agents/${agentId}/tests/${t.id}`, { method: "DELETE" }); load(); }} className="text-muted hover:text-bad"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
