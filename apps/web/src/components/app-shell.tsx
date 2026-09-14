"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  BookOpen,
  Building2,
  ClipboardCheck,
  Fingerprint,
  FolderOpen,
  GitCompare,
  Home,
  Info,
  LayoutDashboard,
  Menu,
  Moon,
  Phone,
  Settings,
  Sparkles,
  Sun,
  Upload,
  X,
} from "lucide-react";
import { clsx } from "@/lib/format";
import { usePreferences } from "@/store/preferences-provider";
import { useSession } from "@/store/session-provider";
import { BrandMark } from "./brand-mark";
import { ModeSwitch } from "./mode-switch";

const PRIMARY = [
  { href: "/demo", label: "Demo", icon: Sparkles },
  { href: "/monitor", label: "Call", icon: Phone },
  { href: "/adapters/bank", label: "Bank", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

const NAV_GROUPS = [
  {
    label: "Product",
    items: [
      { href: "/guide", label: "How Core works", icon: Info },
      { href: "/demo", label: "Judge demo", icon: Sparkles },
      { href: "/monitor", label: "Call adapter", icon: Phone },
      { href: "/adapters/bank", label: "Bank adapter", icon: Building2 },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/console", label: "Console", icon: Home },
      { href: "/analyze", label: "Analyze", icon: Upload },
      { href: "/compare", label: "Compare", icon: GitCompare },
      { href: "/incidents", label: "Incidents", icon: FolderOpen },
    ],
  },
  {
    label: "Reference",
    items: [
      { href: "/protect", label: "Playbook", icon: BookOpen },
      { href: "/operations", label: "API / ops", icon: LayoutDashboard },
      { href: "/calibrate", label: "Calibrate", icon: ClipboardCheck },
      { href: "/scenarios", label: "Scenarios", icon: Activity },
      { href: "/enroll", label: "Voiceprint stub", icon: Fingerprint },
    ],
  },
];

const FLAT = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [open, setOpen] = useState(false);
  const { mode, setMode, session, lastResult } = useSession();
  const { theme, setTheme } = usePreferences();

  if (isLanding) return <>{children}</>;

  const live = session.active;
  const band = session.result?.band ?? lastResult?.band;
  const pageLabel = FLAT.find((n) => n.href === pathname)?.label ?? "VoxShield";

  return (
    <div className="flex min-h-screen">
      <div className="grain" />
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-[var(--line)] bg-[var(--bg-elev)]/95 backdrop-blur-xl transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="relative border-b border-[var(--line)] px-5 py-5">
          <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <BrandMark size={34} />
            <span>
              <span className="block text-[15px] font-medium tracking-tight">VoxShield</span>
              <span className="block text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
                Core
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="absolute right-4 top-5 text-[var(--muted)] lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={clsx(
                        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                        active
                          ? "bg-[var(--accent-dim)] text-[var(--text)] shadow-[inset_3px_0_0_var(--accent)]"
                          : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]",
                      )}
                    >
                      <Icon size={15} className={active ? "text-[var(--accent)]" : ""} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-[var(--line)] p-3">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
              pathname === "/settings"
                ? "bg-[var(--accent-dim)] text-[var(--text)]"
                : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]",
            )}
          >
            <Settings size={15} className={pathname === "/settings" ? "text-[var(--accent)]" : ""} />
            Settings
          </Link>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">Mode</span>
              <button
                type="button"
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </div>
            <ModeSwitch mode={mode} onChange={setMode} />
          </div>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="relative flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--bg)]/85 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-[var(--line)] p-2 text-[var(--muted)] lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu size={16} />
            </button>
            <div>
              <div className="text-sm font-medium">{pageLabel}</div>
              <div className="text-[11px] text-[var(--faint)]">SIH26104 · Core API</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                live
                  ? "border-[rgba(255,122,112,0.35)] bg-band-high text-[var(--high)]"
                  : "border-[var(--line)] text-[var(--muted)]",
              )}
            >
              <span className={clsx("h-1.5 w-1.5 rounded-full", live ? "live-dot bg-[var(--high)]" : "bg-[var(--faint)]")} />
              {live ? "Live" : "Idle"}
            </span>
            {band ? (
              <span className={`hidden rounded-full bg-band-${band} px-2.5 py-1 text-[11px] capitalize sm:inline band-${band}`}>
                {band}
              </span>
            ) : null}
          </div>
        </header>

        <nav className="flex border-b border-[var(--line)] bg-[var(--bg-elev)]/80 px-1 py-1.5 lg:hidden">
          {PRIMARY.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-[10px] uppercase tracking-[0.1em]",
                  active ? "bg-[var(--accent-dim)] text-[var(--accent)]" : "text-[var(--faint)]",
                )}
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
