import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  default: "bg-line/60 text-muted",
  accent: "bg-accent/15 text-accent",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
  blue: "bg-accent2/15 text-accent2",
};

export function Badge({ tone = "default", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", tones[tone], className)} {...p} />;
}
