"use client";

import Link from "next/link";
import { PageIntro } from "@/components/atmosphere";

const STEPS = [
  ["Capture", "Mic stream or file. Silence is never scored as fake."],
  ["Window", "1–2 second slices. First score aims under three seconds."],
  ["Fuse", "Acoustic + prosody + optional neural + context."],
  ["Act", "Protect playbook or Operations hold / MFA / escalate."],
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageIntro
        kicker="For the viva"
        title="How VoxShield decides."
        body="Walk this page if a judge asks what is original work versus a wrapped model."
      />

      <div className="grid gap-4 md:grid-cols-4">
        {STEPS.map(([t, b], i) => (
          <div key={t} className="card p-5">
            <div className="font-mono text-xs text-[var(--accent)]">0{i + 1}</div>
            <div className="font-serif mt-3 text-2xl">{t}</div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{b}</p>
          </div>
        ))}
      </div>

      <section className="card p-6 sm:p-8">
        <div className="kicker">What we will not fake</div>
        <h2 className="font-serif mt-3 text-3xl">Detection first. Chrome later.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
          This UI already scores audio in the browser so the demo can move. Phase 3 replaces the
          preview engine with the FastAPI fusion path and must separate a teammate’s real voice
          from our XTTS / OpenVoice clone. We do not ship a public cloner.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/compare" className="btn-primary">See A / B bench</Link>
          <Link href="/scenarios" className="btn-ghost">Load a story</Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <div className="kicker">Privacy</div>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            Default retention is features, score, timestamp. Raw audio dies with the tab unless
            someone turns on a demo-only keep — and that is off.
          </p>
        </div>
        <div className="card p-6">
          <div className="kicker">Languages</div>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            DSP is language-agnostic. Context keywords start with English and Hindi. Accents are
            not a separate model in v1 — they ride the same features.
          </p>
        </div>
      </section>
    </div>
  );
}
