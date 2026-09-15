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

        <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] lg:items-center lg:gap-10 lg:px-12 lg:py-0 xl:gap-8">
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

          <div className="relative mt-12 flex justify-center overflow-visible lg:mt-0 lg:justify-center">
            <PhoneMock3D className="phone-stage--hero" />
          </div>
        </section>

        <a
          href="#adapters"
          className="mx-auto mb-8 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)] transition hover:text-[var(--muted)]"
          onClick={(e) => {
            e.preventDefault();
            const target = document.getElementById("adapters");
            if (!target) return;
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
            window.history.replaceState(null, "", "#adapters");
          }}
        >
          Demo adapters
          <ArrowDown size={12} />
        </a>
      </div>

      {/* Viewport 2 — Same Core (scroll to see) */}
      <main className="relative z-10 border-t border-[var(--line)]">
        <section id="adapters" className="adapters-stage">
          <div className="adapters-glow" aria-hidden />
          <div className="mx-auto max-w-7xl px-6 py-20 sm:px-10 sm:py-28 lg:px-12 lg:py-32">
            <div className="adapters-intro max-w-5xl">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">Demo adapters</p>
              <h2 className="font-serif mt-4 text-4xl leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl xl:text-[4.25rem]">
                Same Core.{" "}
                <span className="italic text-[var(--accent)]">Two hosts.</span>
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-[var(--muted)] sm:text-lg sm:leading-9">
                Not the product — live examples of how a calling app and a bank consume the same
                VoxShield engine.
              </p>
            </div>

            <div className="adapters-core-line mt-12 flex items-center gap-3 sm:mt-14" aria-hidden>
              <span className="adapters-core-pill">VoxShield Core</span>
              <span className="adapters-core-rule" />
              <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">REST · WS · SDK</span>
              <span className="adapters-core-rule" />
              <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">Any host</span>
            </div>

            <div className="mt-12 grid gap-5 lg:mt-16 lg:grid-cols-2 lg:gap-6">
              <Link href="/monitor" className="adapter-panel adapter-panel--call group">
                <div className="adapter-panel-index">01</div>
                <div className="adapter-panel-visual" aria-hidden>
                  <span className="adapter-wave" />
                  <span className="adapter-wave adapter-wave--2" />
                  <span className="adapter-wave adapter-wave--3" />
                  <Phone className="adapter-panel-icon" size={28} />
                </div>
                <div className="adapter-panel-body">
                  <div className="flex items-center gap-2 text-[var(--accent)]">
                    <span className="text-[11px] uppercase tracking-[0.16em]">Call adapter</span>
                  </div>
                  <h3 className="font-serif mt-3 text-3xl tracking-tight sm:text-4xl">Live call host</h3>
                  <p className="mt-3 max-w-sm text-sm leading-7 text-[var(--muted)]">
                    Mic → WebSocket stream → authenticity + fraud in real time. Host policy can
                    warn or simulate auto-cut.
                  </p>
                  <span className="adapter-panel-cta mt-8 inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
                    Open call demo
                    <ArrowRight size={16} className="transition duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>

              <Link href="/adapters/bank" className="adapter-panel adapter-panel--bank group">
                <div className="adapter-panel-index">02</div>
                <div className="adapter-panel-visual" aria-hidden>
                  <span className="adapter-ledger" />
                  <Building2 className="adapter-panel-icon" size={28} />
                </div>
                <div className="adapter-panel-body">
                  <div className="flex items-center gap-2 text-[var(--accent-2)]">
                    <span className="text-[11px] uppercase tracking-[0.16em]">Bank adapter</span>
                  </div>
                  <h3 className="font-serif mt-3 text-3xl tracking-tight sm:text-4xl">Banking host</h3>
                  <p className="mt-3 max-w-sm text-sm leading-7 text-[var(--muted)]">
                    High-value transfer request → Core risk scores → Hold / MFA / callback before
                    money moves.
                  </p>
                  <span className="adapter-panel-cta mt-8 inline-flex items-center gap-2 text-sm font-medium text-[var(--accent-2)]">
                    Open bank demo
                    <ArrowRight size={16} className="transition duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </div>
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
