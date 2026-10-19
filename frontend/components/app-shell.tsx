"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Bot, CreditCard, LayoutDashboard, LayoutTemplate, LogOut, Menu, Moon, Plus, Settings, Sun, X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/agents/new", label: "Make a new AI", icon: Plus },
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/agents", label: "My AIs", icon: Bot },
  { href: "/templates", label: "Ready-made AIs", icon: LayoutTemplate },
  { href: "/analytics", label: "How it's going", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "My plan", icon: CreditCard },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const active = (href: string) =>
    href === "/agents" ? path === "/agents" || (path.startsWith("/agents/") && !path.startsWith("/agents/new")) : path.startsWith(href);

  const nav = (
    <nav className="flex h-full flex-col gap-1 p-4">
      <div className="mb-6 px-2 pt-1 text-lg"><Logo /></div>
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          className={cn(
            "group flex min-h-12 items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors",
            href === "/agents/new" ? "mb-3 bg-accent text-white hover:bg-accent/90 dark:text-bg" : active(href) ? "bg-line/60 text-fg" : "text-fg/80 hover:bg-line/40 hover:text-fg"
          )}
        >
          <Icon className="h-5 w-5 shrink-0" />
          {label}
        </Link>
      ))}
      <div className="mt-auto space-y-2">
        <button onClick={toggle} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-base text-fg/80 hover:bg-line/40 hover:text-fg">
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          {theme === "dark" ? "Bright screen" : "Dark screen"}
        </button>
        <div className="flex items-center gap-3 border-t border-line px-1 pt-3">
          <Link href="/settings" className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-line text-xs font-semibold text-fg">
              {(user?.display_name || user?.email || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{user?.display_name}</span>
              <span className="block truncate text-xs text-muted">{user?.email}</span>
            </span>
          </Link>
          <button onClick={signOut} title="Sign out" aria-label="Sign out" className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-fg/80 hover:bg-line/50 hover:text-fg">
            <LogOut className="h-5 w-5" />Sign out
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-line bg-panel lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-line bg-panel">{nav}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg px-4 lg:hidden">
          <Logo />
          <button onClick={() => setOpen((o) => !o)} aria-label="Menu" className="p-2">{open ? <X /> : <Menu />}</button>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
