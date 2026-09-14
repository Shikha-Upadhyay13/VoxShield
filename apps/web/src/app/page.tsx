"use client";

import Link from "next/link";
import { ArrowRight, Building2, Code2, Phone, Settings } from "lucide-react";
import { Atmosphere } from "@/components/atmosphere";
import { BrandMark } from "@/components/brand-mark";
import { PhoneMock3D } from "@/components/phone-mock-3d";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Atmosphere />
      <div className="pointer-events-none absolute inset-0 grid-fade" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <BrandMark />
          <span>
            <span className="block text-sm font-medium tracking-tight">VoxShield</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-[var(--faint)]">
              Voice security core
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-4 sm:gap-5">
          <Link href="/guide" className="hidden text-xs text-[var(--muted)] hover:text-[var(--text)] md:inline">
            How it works
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
          >
            <Settings size={14} />
            Settings
          </Link>
          <Link href="/demo" className="btn-primary !px-3.5 !py-1.5 text-xs">
            Open demo
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-24">
        {/* Section 1 — product hero */}
        <section className="grid items-center gap-8 border-b border-[var(--line)] pb-16 pt-8 sm:pt-12 lg:grid-cols-[1fr_auto] lg:gap-12 lg:pb-20">
          <div>
            <h1 className="font-serif text-5xl leading-[1.05] tracking-tight text-[var(--text)] sm:text-6xl">
              VoxShield
            </h1>
            <p className="mt-5 max-w-md text-base leading-8 text-[var(--muted)] sm:text-lg">
              The AI voice-integrity layer for calls and banking — authenticity and fraud as
              separate scores, not a dialler.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className="btn-primary">
                Run judge demo
                <ArrowRight size={16} />
              </Link>
              <Link href="/guide" className="btn-ghost">
                View API contract
                <Code2 size={16} />
              </Link>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <PhoneMock3D className="phone-stage--hero" />
          </div>
        </section>

        {/* Section 2 — demo adapters (separate block) */}
        <section className="pt-16 sm:pt-20">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">Demo adapters</p>
          <h2 className="font-serif mt-2 text-3xl tracking-tight sm:text-4xl">Same Core. Two hosts.</h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--muted)]">
            Not the product — examples of how a calling app and a bank consume VoxShield.
          </p>
          <div className="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-12">
            <Link href="/monitor" className="group block">
              <div className="flex items-center gap-2 text-[var(--accent)]">
                <Phone size={16} />
                <span className="text-[11px] uppercase tracking-[0.14em]">Call</span>
              </div>
              <h3 className="mt-3 text-xl font-medium tracking-tight">Call adapter</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Mic → WebSocket → live authenticity + fraud. Host can warn or simulate cut.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--accent)]">
                Open <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
            <Link href="/adapters/bank" className="group block">
              <div className="flex items-center gap-2 text-[var(--accent)]">
                <Building2 size={16} />
                <span className="text-[11px] uppercase tracking-[0.14em]">Bank</span>
              </div>
              <h3 className="mt-3 text-xl font-medium tracking-tight">Bank adapter</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Transfer request → Core scores → Hold / MFA / callback.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--accent)]">
                Open <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>
        </section>

        <footer className="mt-20 flex flex-col gap-3 border-t border-[var(--line)] pt-8 text-xs text-[var(--faint)] sm:flex-row sm:justify-between">
          <span>VoxShield Core · SIH26104</span>
          <span className="flex flex-wrap gap-4">
            <Link href="/settings">Settings</Link>
            <Link href="/demo">Demo</Link>
            <Link href="/guide">Guide</Link>
          </span>
        </footer>
      </main>
    </div>
  );
}
