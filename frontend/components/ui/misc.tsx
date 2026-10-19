import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-3 text-muted">{icon}</div>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-base text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-2 text-lg text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: {
  tabs: { id: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={cn("flex gap-0.5 rounded-md border border-line bg-bg p-0.5", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn("flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition",
            value === t.id ? "bg-card text-fg ring-1 ring-line" : "text-muted hover:text-fg")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** A small "?" that explains something in one sentence. Click or focus it to read; works with keyboard and touch. */
export function Hint({ text, label = "What is this?" }: { text: string; label?: string }) {
  return (
    <details className="group relative inline-block align-middle">
      <summary aria-label={label} title={text}
        className="grid h-7 w-7 cursor-pointer list-none place-items-center rounded-full border border-line bg-card text-sm font-bold text-muted hover:border-accent hover:text-accent [&::-webkit-details-marker]:hidden">?</summary>
      <span role="note" className="absolute left-1/2 top-9 z-50 w-72 -translate-x-1/2 rounded-md border border-line bg-card p-3 text-base font-normal leading-snug text-fg shadow-soft">{text}</span>
    </details>
  );
}
