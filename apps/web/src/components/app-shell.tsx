"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Shield,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { clsx } from "@/lib/format";
import { useSession } from "@/store/session-provider";
import { ModeSwitch } from "./mode-switch";

const NAV = [
  { href: "/monitor", label: "Live Monitor", icon: Activity },
  { href: "/analyze", label: "Analyze", icon: Upload },
  { href: "/protect", label: "Protect", icon: Shield },
  { href: "/operations", label: "Operations", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidents", icon: FolderOpen },
];

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
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[var(--line)] bg-[var(--bg-elev)]/95 backdrop-blur-xl transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent-dim)] text-[var(--accent)]">
              <ShieldAlert size={16} />
            </span>
            <span>
              <span className="block text-sm font-medium tracking-tight">VoxShield</span>
              <span className="block text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
                Voice integrity
              </span>
            </span>
          </Link>
          <button type="button" className="lg:hidden text-[var(--muted)]" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                  active
                    ? "bg-white/6 text-[var(--text)]"
                    : "text-[var(--muted)] hover:bg-white/4 hover:text-[var(--text)]",
                )}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-4 border-t border-[var(--line)] p-4">
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--faint)]">Mode</div>
            <ModeSwitch mode={mode} onChange={setMode} />
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--faint)]">
            Feature-only logging. Raw audio is not retained by default.
          </p>
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--bg)]/80 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-[var(--line)] p-2 text-[var(--muted)] lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu size={16} />
            </button>
            <div>
              <div className="text-sm font-medium">
                {NAV.find((n) => n.href === pathname)?.label ?? "VoxShield"}
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
                  ? "border-[rgba(240,113,103,0.3)] text-[var(--high)]"
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
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
