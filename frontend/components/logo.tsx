import { Sparkles } from "lucide-react";
import Link from "next/link";

export function Logo({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent2 text-white shadow-glow">
        <Sparkles className="h-4 w-4" />
      </span>
      <span>AI Factory</span>
    </Link>
  );
}
