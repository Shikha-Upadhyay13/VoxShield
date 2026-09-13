"use client";

import Link from "next/link";
import { ArrowRight, Building2, Code2, Phone } from "lucide-react";
import { Atmosphere } from "@/components/atmosphere";
import { BrandMark } from "@/components/brand-mark";
import { HeroDeck } from "@/components/hero-deck";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Atmosphere />
      <div className="pointer-events-none absolute inset-0 grid-fade" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <Link href="/" className="flex items-center gap-3">
          <BrandMark />
          <span>
            <span className="block text-sm font-medium tracking-tight">VoxShield</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-[var(--faint)]">
              Voice security core
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/guide" className="hidden text-xs text-[var(--muted)] hover:text-[var(--text)] md:inline">
            How it works
          </Link>
          <Link href="/operations" className="btn-ghost hidden !px-3.5 !py-1.5 text-xs sm:inline-flex">
            API contract
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-10 sm:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/3 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              SIH26104 · One core, multiple adapters
            </div>
            <h1 className="font-serif mt-6 max-w-xl text-5xl leading-[1.05] tracking-tight text-[var(--text)] sm:text-7xl">
              VoxShield is the
              <span className="italic text-[var(--accent)]"> security layer</span>
              , not the dialler.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-8 text-[var(--muted)] sm:text-lg">
              A reusable AI voice-integrity engine: authenticity (clone vs human) and fraud
              (scam speech) as separate scores, exposed over REST and WebSocket. Banks, contact
              centres, and calling apps integrate the same Core — they do not reimplement detection.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/guide" className="btn-primary">
                View API contract
                <Code2 size={16} />
              </Link>
              <Link href="/adapters/bank" className="btn-ghost">
                Open demo adapters
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-[var(--line)] pt-6">
              {[
                ["REST + WS", "Core API"],
                ["2 scores", "Never blended"],
                ["0 audio", "Features only"],
              ].map(([value, label]) => (
                <div key={label}>
                  <div className="font-serif text-2xl">{value}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--faint)]">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <HeroDeck />
        </div>

        <div className="mt-16">
          <div className="kicker">Demo adapters</div>
          <h2 className="font-serif mt-2 text-3xl sm:text-4xl">Same Core. Two example hosts.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
            These are not the product. They show how a calling app and a banking workflow consume
            VoxShield — the same path Truecaller-class or core-banking hosts would use later.
          </p>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <Link href="/monitor" className="card group p-7 transition hover:-translate-y-0.5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-dim)] text-[var(--accent)]">
                  <Phone size={18} />
                </span>
                <div className="kicker">Adapter A</div>
              </div>
              <h3 className="font-serif mt-4 text-2xl">Call demo</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Mic → WebSocket stream → live authenticity + fraud. Host policy can warn or
                simulate auto-cut. Stand-in for a dialler integration.
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm text-[var(--accent)]">
                Open call adapter <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
            <Link href="/adapters/bank" className="card group p-7 transition hover:-translate-y-0.5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-dim)] text-[var(--accent)]">
                  <Building2 size={18} />
                </span>
                <div className="kicker">Adapter B</div>
              </div>
              <h3 className="font-serif mt-4 text-2xl">Mock banking app</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                High-value transfer request → Core risk scores → Hold / MFA / callback. Stand-in
                for a financial workflow integration.
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm text-[var(--accent)]">
                Open bank adapter <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>
        </div>

        <div id="how" className="mt-16 scroll-mt-24">
          <div className="kicker">Architecture</div>
          <h2 className="font-serif mt-2 text-3xl">Core → API / SDK → any host</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {[
              ["1. Stream", "Audio or transcript into Core"],
              ["2. Authenticity", "Clone / synthetic likelihood"],
              ["3. Fraud", "Scam speech & pressure tactics"],
              ["4. Host acts", "Warn, MFA, hold, or cut"],
            ].map(([t, b], i) => (
              <div key={t} className="card p-5">
                <div className="font-mono text-[11px] text-[var(--accent)]">0{i + 1}</div>
                <div className="mt-3 text-sm font-medium">{t}</div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{b}</p>
              </div>
            ))}
          </div>
        </div>

        <footer className="mt-16 flex flex-col gap-3 border-t border-[var(--line)] pt-8 text-xs text-[var(--faint)] sm:flex-row sm:justify-between">
          <span>VoxShield Core · SIH26104 · AICTE Cyber Security Cell</span>
          <span className="flex gap-4">
            <Link href="/guide">How it works</Link>
            <Link href="/monitor">Call adapter</Link>
            <Link href="/adapters/bank">Bank adapter</Link>
          </span>
        </footer>
      </main>
    </div>
  );
}
