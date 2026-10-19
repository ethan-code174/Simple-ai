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
        toast(d.status === "ready" ? "ok" : "error", d.status === "ready" ? `${d.filename} is ready. Your AI can use it now.` : `We couldn't read ${d.filename}. Please try a PDF or text file.`);
      } catch { toast("error", `We couldn't add ${f.name}. Please try a PDF or text file under 10 MB.`); }
    }
    setUploading(false);
    load();
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <h3 className="text-lg font-semibold">Your documents</h3>
      <p className="mt-1 text-base text-muted">Add things your AI should know, like price lists, common questions or opening hours. Only this AI can read them.</p>
      {!hasKnowledgeBlock && <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-base text-warn">Your AI won't read these documents yet. Go to &quot;Ask for changes&quot; and type: “look in my documents”.</p>}
      <button
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`mt-4 flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-base transition ${drag ? "border-accent bg-accent/10" : "border-line hover:border-accent/50"}`}
      >
        {uploading ? <Spinner className="h-6 w-6 text-accent" /> : <UploadCloud className="h-7 w-7 text-accent" />}
        <span>{uploading ? "Reading your file…" : "Click here to add a document"}</span>
        <span className="text-sm text-muted">PDF or text files, up to 10 MB each. You can also drag files here.</span>
      </button>
      <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.md,.markdown" className="hidden" data-testid="doc-upload" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />

      <div className="mt-5 space-y-2">
        {docs?.map((d) => (
          <div key={d.id} className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-base font-medium">{d.filename}</span>
              {d.status === "ready" ? <Badge tone="ok">Ready</Badge> : d.status === "failed" ? <Badge tone="bad">Couldn't read it</Badge> : <Badge>Reading…</Badge>}
            </div>
            <div className="mt-1 flex items-center justify-between text-sm text-muted">
              <details><summary className="cursor-pointer">More details</summary><span>{(d.size_bytes / 1024).toFixed(0)} KB · {d.chunk_count} parts · {d.index_method === "keyword" ? "finds matching words" : "finds matching meaning"}</span></details>
              <span className="flex gap-1">
                <button title="Read this document again" aria-label="Read this document again" onClick={async () => { await api(`/api/documents/${d.id}/reindex`, { method: "POST" }); load(); toast("ok", "Done. The document was read again."); }} className="rounded p-2 hover:bg-line/60"><RefreshCw className="h-5 w-5" /></button>
                <button title="Delete this document" aria-label="Delete this document" onClick={async () => { if (!window.confirm(`Delete “${d.filename}”? Your AI will stop using it.`)) return; await api(`/api/documents/${d.id}`, { method: "DELETE" }); load(); }} className="rounded p-2 hover:bg-line/60 hover:text-bad"><Trash2 className="h-5 w-5" /></button>
              </span>
            </div>
            {d.error && <p className="mt-1 text-sm text-bad">We couldn't read this document. Try deleting it and adding it again, or use a different file.</p>}
          </div>
        ))}
        {docs && docs.length === 0 && <div className="py-4 text-center"><p className="text-base text-muted">No documents yet. Add one so your AI knows about your business.</p><Button size="lg" className="mt-3" onClick={() => fileRef.current?.click()}><UploadCloud />Add a document</Button></div>}
      </div>

      {docs && docs.length > 0 && (
        <div className="mt-6">
          <h4 className="text-lg font-semibold">See what your AI would find</h4>
          <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (q.trim()) setResults(await api(`/api/agents/${agentId}/knowledge/search`, { method: "POST", json: { query: q } })); }}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: opening hours" aria-label="Words to look for" />
            <Button variant="secondary" aria-label="Look"><Search />Look</Button>
          </form>
          {results && (results.length === 0 ? <p className="mt-2 text-base text-muted">Nothing found. Your AI would say it doesn't know.</p> : (
            <div className="mt-2 space-y-2">{results.map((r) => (
              <div key={r.chunk_id} className="rounded-lg bg-bg/60 p-3 text-base"><div className="mb-1 font-medium text-accent">{r.source_label}</div><p className="line-clamp-4 text-muted">{r.content}</p></div>
            ))}</div>
          ))}
          <details className="mt-3 text-sm text-muted"><summary className="cursor-pointer">More details</summary><p className="mt-1">Your AI looks for matching words. If the free AI program (Ollama) has <code>nomic-embed-text</code>, new documents can also be searched by meaning.</p></details>
        </div>
      )}
    </div>
  );
}
