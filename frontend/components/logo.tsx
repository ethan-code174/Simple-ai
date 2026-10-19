import Link from "next/link";

export function Logo({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-fg text-xs font-bold tracking-tight text-bg">AF</span>
      <span>AI Factory</span>
    </Link>
  );
}
