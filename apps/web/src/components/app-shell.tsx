"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  BookOpen,
  Fingerprint,
  FolderOpen,
  GitCompare,
  Home,
  Info,
  LayoutDashboard,
  Menu,
  Shield,
  Upload,
  X,
} from "lucide-react";
import { clsx } from "@/lib/format";
import { useSession } from "@/store/session-provider";
import { BrandMark } from "./brand-mark";
import { ModeSwitch } from "./mode-switch";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ href: "/console", label: "Console", icon: Home }],
  },
  {
    label: "Detect",
    items: [
      { href: "/monitor", label: "Live Monitor", icon: Activity },
      { href: "/analyze", label: "Analyze", icon: Upload },
      { href: "/compare", label: "Compare", icon: GitCompare },
    ],
  },
  {
    label: "Respond",
    items: [
      { href: "/protect", label: "Protect", icon: Shield },
      { href: "/operations", label: "Operations", icon: LayoutDashboard },
      { href: "/incidents", label: "Incidents", icon: FolderOpen },
    ],
  },
  {
    label: "Library",
    items: [
      { href: "/scenarios", label: "Scenarios", icon: BookOpen },
      { href: "/enroll", label: "Voiceprint", icon: Fingerprint },
      { href: "/guide", label: "How it works", icon: Info },
    ],
  },
];

const FLAT = NAV_GROUPS.flatMap((g) => g.items);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [open, setOpen] = useState(false);
  const { mode, setMode, session, lastResult } = useSession();

  if (isLanding) return <>{children}</>;

  const live = session.active;
  const band = session.result?.band ?? lastResult?.band;

  return (
    <div className="flex min-h-screen">
      <div className="grain" />
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-[var(--line)] bg-[var(--bg-elev)]/90 backdrop-blur-2xl transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="px-5 py-6">
          <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <BrandMark size={36} />
            <span>
              <span className="block text-[15px] font-medium tracking-tight">VoxShield</span>
              <span className="block text-[10px] uppercase tracking-[0.2em] text-[var(--faint)]">
                Voice integrity
              </span>
            </span>
          </Link>
          <button type="button" className="absolute right-4 top-6 lg:hidden text-[var(--muted)]" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-1.5 px-3 text-[10px] uppercase tracking-[0.16em] text-[var(--faint)]">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={clsx(
                        "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm transition",
                        active
                          ? "bg-white/6 text-[var(--text)] shadow-[inset_3px_0_0_var(--accent)]"
                          : "text-[var(--muted)] hover:bg-white/4 hover:text-[var(--text)]",
                      )}
                    >
                      <Icon size={16} className={active ? "text-[var(--accent)]" : ""} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="m-3 rounded-2xl border border-[var(--line)] bg-black/20 p-4">
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--faint)]">Mode</div>
          <ModeSwitch mode={mode} onChange={setMode} />
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--faint)]">
            Feature-only logging. Raw audio is not retained.
          </p>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/55 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64"
          style={{ background: "radial-gradient(600px 180px at 80% 0%, rgba(124,232,204,0.07), transparent)" }}
        />
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--bg)]/70 px-4 py-3.5 backdrop-blur-2xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-[var(--line)] p-2 text-[var(--muted)] lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu size={16} />
            </button>
            <div>
              <div className="text-sm font-medium">
                {FLAT.find((n) => n.href === pathname)?.label ?? "VoxShield"}
              </div>
              <div className="text-[11px] text-[var(--faint)]">
                SIH26104 · {mode === "protect" ? "Family protection" : "Bank / enterprise ops"}
              </div>
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
              {live ? "Session live" : "Idle"}
            </span>
            {band ? (
              <span className={`hidden rounded-full bg-band-${band} px-2.5 py-1 text-[11px] capitalize sm:inline band-${band}`}>
                {band}
              </span>
            ) : null}
          </div>
        </header>
        <main className="relative flex-1 px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
