"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, Building2, Code2, Phone, Settings } from "lucide-react";
import { Atmosphere } from "@/components/atmosphere";
import { BrandMark } from "@/components/brand-mark";
import { PhoneMock3D } from "@/components/phone-mock-3d";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Atmosphere />
      <div className="pointer-events-none absolute inset-0 grid-fade" />

      {/* Viewport 1 — product only */}
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5 sm:px-10 lg:px-12">
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

        <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:grid lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-16 lg:px-12 lg:py-0 xl:gap-20">
          <div className="max-w-2xl">
            <h1 className="font-serif text-5xl leading-[1.02] tracking-tight text-[var(--text)] sm:text-6xl lg:text-7xl xl:text-[5.25rem]">
              VoxShield
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-[var(--muted)] sm:text-xl sm:leading-9">
              The AI voice-integrity layer for calls and banking — authenticity and fraud as
              separate scores, not a dialler.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
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

          <div className="mt-12 flex justify-center lg:mt-0 lg:justify-end">
            <PhoneMock3D className="phone-stage--hero" />
          </div>
        </section>

        <a
          href="#adapters"
          className="mx-auto mb-8 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)] transition hover:text-[var(--muted)]"
        >
          Demo adapters
          <ArrowDown size={12} />
        </a>
      </div>

      {/* Viewport 2 — Same Core (scroll to see) */}
      <main className="relative z-10 border-t border-[var(--line)] bg-[var(--bg)]/40">
        <section
          id="adapters"
          className="mx-auto max-w-7xl scroll-mt-8 px-6 py-20 sm:px-10 sm:py-24 lg:px-12"
        >
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">Demo adapters</p>
          <h2 className="font-serif mt-3 text-4xl tracking-tight sm:text-5xl">Same Core. Two hosts.</h2>
          <p className="mt-4 max-w-xl text-base leading-8 text-[var(--muted)]">
            Not the product — examples of how a calling app and a bank consume VoxShield.
          </p>
          <div className="mt-14 grid gap-12 sm:grid-cols-2 sm:gap-16">
            <Link href="/monitor" className="group block">
              <div className="flex items-center gap-2 text-[var(--accent)]">
                <Phone size={16} />
                <span className="text-[11px] uppercase tracking-[0.14em]">Call</span>
              </div>
              <h3 className="mt-4 text-2xl font-medium tracking-tight">Call adapter</h3>
              <p className="mt-3 max-w-sm text-sm leading-7 text-[var(--muted)]">
                Mic → WebSocket → live authenticity + fraud. Host can warn or simulate cut.
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm text-[var(--accent)]">
                Open <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
            <Link href="/adapters/bank" className="group block">
              <div className="flex items-center gap-2 text-[var(--accent)]">
                <Building2 size={16} />
                <span className="text-[11px] uppercase tracking-[0.14em]">Bank</span>
              </div>
              <h3 className="mt-4 text-2xl font-medium tracking-tight">Bank adapter</h3>
              <p className="mt-3 max-w-sm text-sm leading-7 text-[var(--muted)]">
                Transfer request → Core scores → Hold / MFA / callback.
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm text-[var(--accent)]">
                Open <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>
        </section>

        <footer className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-[var(--line)] px-6 py-8 text-xs text-[var(--faint)] sm:flex-row sm:justify-between sm:px-10 lg:px-12">
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
