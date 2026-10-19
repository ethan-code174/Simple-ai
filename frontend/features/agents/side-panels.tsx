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
      <h3 className="text-lg font-semibold">Saved copies</h3>
      <p className="mt-1 text-base text-muted">Each time you save, we keep a copy. You can go back to an older copy. Nothing is lost when you do.</p>
      <div className="mt-4 space-y-2">
        {!versions ? <Spinner /> : versions.length === 0 ? <p className="text-base text-muted">No saved copies yet. They appear here after you save.</p> : versions.map((v, i) => (
          <div key={v.version} className="flex items-start gap-3 rounded-xl border border-line p-3">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="text-base font-medium">Saved copy {v.version} {i === 0 && <span className="text-sm text-accent">(the newest)</span>}</div>
              <div className="truncate text-sm text-muted" title={v.note}>{v.note || "Saved"}</div>
              <div className="text-sm text-muted">{timeAgo(v.created_at)} · {v.blocks} {v.blocks === 1 ? "step" : "steps"}</div>
            </div>
            {i !== 0 && <Button size="sm" variant="ghost" onClick={() => onRestore(v.version)}><RotateCcw />Go back to this</Button>}
          </div>
        ))}
      </div>
    </div>
  );
}

type TestCase = { id: string; input_text: string; assertion: string; expected: string; last_result: { passed: boolean; detail: string; reply: string } | null };
const CHECKS = [
  { value: "contains", label: "The answer includes these words", needs: "words" },
  { value: "not_contains", label: "The answer does not include these words", needs: "words" },
  { value: "uses_documents", label: "The answer uses my documents", needs: "document name, if you want" },
  { value: "max_length", label: "The answer is shorter than (letters)", needs: "a number" },
  { value: "equals", label: "The answer is exactly", needs: "words" },
  { value: "succeeds", label: "It answers without a problem", needs: "" },
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
    catch { toast("error", "We couldn't add this check. Please try again."); }
  };
  const runAll = async () => {
    setRunning(true);
    try {
      await beforeRun();
      const r = await api(`/api/agents/${agentId}/tests/run`, { method: "POST" });
      setTests(r.results);
      setSummary(`${r.passed} of ${r.total} checks worked. ${r.note}`);
    } catch { toast("error", "We couldn't run the checks. Please try again in a moment."); } finally { setRunning(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h3 className="text-lg font-semibold">Checks</h3>
      <p className="mt-1 text-base text-muted">Write a question someone might ask, and what a good answer should have. After you change your AI, run the checks to make sure it still answers well.</p>
      <form onSubmit={add} className="mt-4 space-y-3 rounded-xl border border-line p-3">
        <div><Label>When someone asks</Label><Input value={form.input_text} onChange={(e) => setForm({ ...form, input_text: e.target.value })} placeholder="What are your opening hours?" required /></div>
        <div><Label>Make sure that</Label><Select value={form.assertion} onChange={(e) => setForm({ ...form, assertion: e.target.value })}>{CHECKS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></div>
        {check.needs && <div><Label>Type the {check.needs}</Label><Input value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} placeholder={check.value === "contains" ? "7am" : ""} /></div>}
        <Button variant="secondary" className="w-full"><Plus />Add this check</Button>
      </form>
      {tests.length > 0 && (
        <>
          <Button className="mt-4 w-full" onClick={runAll} disabled={running}>{running ? <Spinner /> : <Play />}Run {tests.length} {tests.length > 1 ? "checks" : "check"}</Button>
          {summary && <p className="mt-2 text-base text-muted">{summary}</p>}
          <div className="mt-3 space-y-2">
            {tests.map((t) => (
              <div key={t.id} className="rounded-xl border border-line p-3 text-base">
                <div className="flex items-start gap-2">
                  {t.last_result ? (t.last_result.passed ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-bad" />) : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-line" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">“{t.input_text}”</div>
                    <div className="text-sm text-muted">{CHECKS.find((c) => c.value === t.assertion)?.label} {t.expected && `“${t.expected}”`}</div>
                    {t.last_result && <div className={`mt-1 text-sm ${t.last_result.passed ? "text-ok" : "text-bad"}`}>{t.last_result.detail}</div>}
                  </div>
                  <button aria-label="Delete this check" title="Delete this check" onClick={async () => { if (!window.confirm("Delete this check?")) return; await api(`/api/agents/${agentId}/tests/${t.id}`, { method: "DELETE" }); load(); }} className="rounded p-2 text-muted hover:text-bad"><Trash2 className="h-5 w-5" /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
