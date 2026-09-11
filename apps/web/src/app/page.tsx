"use client";

import Link from "next/link";
import { ArrowRight, AudioWaveform, Brain, Globe2, Shield } from "lucide-react";
import { Atmosphere } from "@/components/atmosphere";
import { BrandMark } from "@/components/brand-mark";
import { HeroDeck } from "@/components/hero-deck";
import { ModeSwitch } from "@/components/mode-switch";
import { useSession } from "@/store/session-provider";

const LAYERS = [
  {
    k: "01",
    title: "Acoustic",
    body: "Spectral artifacts, phase residuals, vocoder cutoffs that TTS leaves behind.",
    icon: AudioWaveform,
  },
  {
    k: "02",
    title: "Prosody",
    body: "Pitch contour, pauses, the micro-variation a cloned voice flattens out.",
    icon: Globe2,
  },
  {
    k: "03",
    title: "Neural",
    body: "Optional anti-spoof model. Stays off if the demo laptop cannot load it.",
    icon: Brain,
  },
  {
    k: "04",
    title: "Context",
    body: "Unknown number, first-time caller, urgency language in English and Hindi.",
    icon: Shield,
  },
];

export default function HomePage() {
  const { mode, setMode } = useSession();

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
              Voice integrity
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <ModeSwitch mode={mode} onChange={setMode} />
          <Link href="/monitor" className="btn-ghost hidden !px-3.5 !py-1.5 text-xs sm:inline-flex">
            Open console
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-10 sm:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/3 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              SIH26104 · AICTE Cyber Security
            </div>
            <h1 className="font-serif mt-6 max-w-xl text-5xl leading-[1.05] tracking-tight text-[var(--text)] sm:text-7xl">
              Trusted voices
              <span className="italic text-[var(--accent)]"> can be faked.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-8 text-[var(--muted)] sm:text-lg">
              Score a live call for cloning while it is still happening — then tell a
              family or a bank analyst what to do before money moves.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/monitor" className="btn-primary">
                Start live check
                <ArrowRight size={16} />
              </Link>
              <Link href="/analyze" className="btn-ghost">
                Upload audio
              </Link>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-[var(--line)] pt-6">
              {[
                ["< 3s", "First score"],
                ["0 audio", "Stored by default"],
                ["EN + HI", "Keyword pack"],
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

        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LAYERS.map((layer) => {
            const Icon = layer.icon;
            return (
              <div key={layer.k} className="card group p-6 transition hover:-translate-y-0.5">
                <div className="mb-8 flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-dim)] text-[var(--accent)]">
                    <Icon size={16} />
                  </span>
                  <span className="font-mono text-[11px] text-[var(--faint)]">{layer.k}</span>
                </div>
                <div className="text-base font-medium">{layer.title}</div>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{layer.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="card p-7">
            <div className="kicker">Protect</div>
            <h2 className="font-serif mt-3 text-3xl">For the person who trusts the voice.</h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-[var(--muted)]">
              Hang up. Call back on a saved number. Never UPI or OTP under pressure.
              Written so a parent can follow it in thirty seconds.
            </p>
          </div>
          <div className="card p-7">
            <div className="kicker">Operations</div>
            <h2 className="font-serif mt-3 text-3xl">For the analyst who must not miss it.</h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-[var(--muted)]">
              Hold the transfer, request MFA, escalate — with caller metadata and a
              documented API that looks like a platform, not a one-off site.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
