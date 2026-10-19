"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, RefreshCw, Search, Trash2, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { Doc } from "@/types";

export function KnowledgePanel({ agentId, hasKnowledgeBlock }: { agentId: string; hasKnowledgeBlock: boolean }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const load = useCallback(() => api<Doc[]>(`/api/agents/${agentId}/documents`).then(setDocs), [agentId]);
  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const d = await api<Doc>(`/api/agents/${agentId}/documents`, { method: "POST", body: fd });
        toast(d.status === "ready" ? "ok" : "error", d.status === "ready" ? `${d.filename} is ready (${d.chunk_count} sections)` : `${d.filename}: ${d.error}`);
      } catch (e: any) { toast("error", `${f.name}: ${e.message}`); }
    }
    setUploading(false);
    load();
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <h3 className="font-semibold">Upload what your AI needs to know</h3>
      <p className="mt-1 text-xs text-muted">PDF, TXT or Markdown files: price lists, FAQs, policies, opening hours. Only this agent can see them.</p>
      {!hasKnowledgeBlock && <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">This workflow has no Knowledge Search block, so it won't use these documents yet. Ask The Architect to “add document search”.</p>}
      <button
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`mt-4 flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-sm transition ${drag ? "border-accent bg-accent/10" : "border-line hover:border-accent/50"}`}
      >
        {uploading ? <Spinner className="h-6 w-6 text-accent" /> : <UploadCloud className="h-7 w-7 text-accent" />}
        <span>{uploading ? "Reading your file…" : "Drop files here or click to upload"}</span>
        <span className="text-xs text-muted">Up to 10 MB each</span>
      </button>
      <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.md,.markdown" className="hidden" data-testid="doc-upload" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />

      <div className="mt-5 space-y-2">
        {docs?.map((d) => (
          <div key={d.id} className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.filename}</span>
              {d.status === "ready" ? <Badge tone="ok">Ready</Badge> : d.status === "failed" ? <Badge tone="bad">Failed</Badge> : <Badge>Processing</Badge>}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <span>{(d.size_bytes / 1024).toFixed(0)} KB · {d.chunk_count} sections · {d.index_method === "keyword" ? "keyword search" : d.index_method}</span>
              <span className="flex gap-1">
                <button title="Re-read file" aria-label="Reindex" onClick={async () => { await api(`/api/documents/${d.id}/reindex`, { method: "POST" }); load(); toast("ok", "Re-indexed"); }} className="rounded p-1 hover:bg-line/60"><RefreshCw className="h-3.5 w-3.5" /></button>
                <button title="Delete" aria-label="Delete document" onClick={async () => { await api(`/api/documents/${d.id}`, { method: "DELETE" }); load(); }} className="rounded p-1 hover:bg-line/60 hover:text-bad"><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            </div>
            {d.error && <p className="mt-1 text-xs text-bad">{d.error}</p>}
          </div>
        ))}
        {docs && docs.length === 0 && <p className="py-4 text-center text-xs text-muted">No documents yet.</p>}
      </div>

      {docs && docs.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Try a search</h4>
          <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (q.trim()) setResults(await api(`/api/agents/${agentId}/knowledge/search`, { method: "POST", json: { query: q } })); }}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. opening hours" />
            <Button size="icon" className="h-9 w-9" variant="secondary" aria-label="Search"><Search /></Button>
          </form>
          {results && (results.length === 0 ? <p className="mt-2 text-xs text-muted">Nothing matched. Your agent would say it doesn't know.</p> : (
            <div className="mt-2 space-y-2">{results.map((r) => (
              <div key={r.chunk_id} className="rounded-lg bg-bg/60 p-2.5 text-xs"><div className="mb-1 font-medium text-accent">{r.source_label}</div><p className="line-clamp-4 text-muted">{r.content}</p></div>
            ))}</div>
          ))}
          <p className="mt-3 text-xs text-muted">Search uses keyword matching (BM25). If Ollama has <code>nomic-embed-text</code>, new uploads also get meaning-based search.</p>
        </div>
      )}
    </div>
  );
}
