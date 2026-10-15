import { Fragment } from "react";

/** Tiny safe renderer for the Architect's messages: **bold**, bullet and numbered lists, paragraphs. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i} className="font-semibold text-fg">{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
}

export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(<Tag key={out.length} className={`my-1.5 space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"}`}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</Tag>);
    list = null;
  };
  for (const line of lines) {
    const ul = line.match(/^\s*[-•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((ul ?? ol)![1]);
    } else {
      flush();
      if (line.trim()) out.push(<p key={out.length} className="my-1">{inline(line)}</p>);
    }
  }
  flush();
  return <div className="leading-relaxed">{out}</div>;
}
