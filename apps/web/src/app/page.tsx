"use client";

import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { ModeSwitch } from "@/components/mode-switch";
import { useSession } from "@/store/session-provider";

const LAYERS = [
  {
    k: "01",
    title: "Acoustic",
    body: "Spectral artifacts, phase residuals, vocoder cutoffs.",
  },
  {
    k: "02",
    title: "Prosody",
    body: "Pitch contour, pauses, the micro-variation TTS flattens.",
  },
  {
    k: "03",
    title: "Neural",
    body: "Optional anti-spoof model. Off if the laptop cannot load it.",
  },
  {
    k: "04",
    title: "Context",
    body: "Unknown number, first-time caller, urgency language.",
  },
];

export default function HomePage() {
  const { mode, setMode } = useSession();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-fade" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent-dim)] text-[var(--accent)]">
            <ShieldAlert size={16} />
          </span>
          <span className="text-sm font-medium tracking-tight">VoxShield</span>
        </Link>
        <div className="flex items-center gap-3">
          <ModeSwitch mode={mode} onChange={setMode} />
          <Link
            href="/monitor"
            className="hidden rounded-full border border-[var(--line)] px-3.5 py-1.5 text-xs text-[var(--muted)] sm:inline"
          >
            Open console
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-16 sm:pt-24">
        <p className="mb-5 text-[11px] uppercase tracking-[0.22em] text-[var(--faint)]">
          SIH26104 · AICTE Cyber Security Cell
        </p>
        <h1 className="font-serif max-w-4xl text-4xl leading-[1.1] tracking-tight text-[var(--text)] sm:text-6xl">
          Trusted voices can be faked.
          <span className="italic text-[var(--accent)]"> Money moves </span>
          before anyone doubts the voice.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
          VoxShield scores a live or uploaded voice for cloning while the conversation
          is still happening — then tells a family member or a bank analyst what to do
          right now.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/monitor"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[#06201a]"
          >
            Start live check
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/analyze"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line-strong)] px-5 py-3 text-sm text-[var(--text)]"
          >
            Upload audio
          </Link>
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LAYERS.map((layer) => (
            <div key={layer.k} className="card p-5">
              <div className="mb-8 font-mono text-[11px] text-[var(--faint)]">{layer.k}</div>
              <div className="text-sm font-medium">{layer.title}</div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{layer.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-6 border-t border-[var(--line)] pt-10 lg:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">Protect</div>
            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
              Plain language for families. Hang up. Call back on a saved number. Never
              UPI or OTP under pressure.
            </p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">Operations</div>
            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
              Analyst console for banks and enterprises. Hold the transfer, request MFA,
              escalate — with a documented API.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
