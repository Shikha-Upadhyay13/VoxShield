"use client";

import Link from "next/link";
import { PageIntro } from "@/components/atmosphere";

const STEPS = [
  ["Stream", "Host sends live audio (WS) or a clip (REST) into Core."],
  ["Authenticity", "Neural + DSP: clone / synthetic likelihood (AST + wav2vec2 + prosody)."],
  ["Fraud", "Scam-intent layer: SilverGuard + EN/HI lexicon + amounts."],
  ["Verdict", "Action matrix — never a blended single score."],
  ["Host acts", "Adapter warns, holds, MFA, or cuts — Core does not own the dialler."],
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageIntro
        kicker="VoxShield Core"
        title="The product is the API."
        body="One reusable voice-security engine. Demo apps are adapters that prove integration — they are not the product."
      />

      <div className="grid gap-4 md:grid-cols-5">
        {STEPS.map(([t, b], i) => (
          <div key={t} className="card p-5">
            <div className="font-mono text-xs text-[var(--accent)]">0{i + 1}</div>
            <div className="font-serif mt-3 text-xl">{t}</div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{b}</p>
          </div>
        ))}
      </div>

      <section className="card p-6 sm:p-8">
        <div className="kicker">Contract</div>
        <h2 className="font-serif mt-3 text-3xl">REST + WebSocket today. gRPC later.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
          Integrators call <code className="font-mono text-[var(--accent)]">GET /health</code>,{" "}
          <code className="font-mono text-[var(--accent)]">GET /v1/capabilities</code>,{" "}
          <code className="font-mono text-[var(--accent)]">POST /analyze</code>,{" "}
          <code className="font-mono text-[var(--accent)]">POST /score-text</code>, and{" "}
          <code className="font-mono text-[var(--accent)]">WS /stream</code> (alias{" "}
          <code className="font-mono text-[var(--accent)]">/ws/call-stream/&#123;id&#125;</code>).
          Full JSON: <span className="text-[var(--text)]">docs/ENGINE.md §7</span>. Thin TS SDK:{" "}
          <code className="font-mono">apps/web/src/sdk</code>.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-xl border border-[var(--line)] bg-black/40 p-4 font-mono text-[11px] leading-5 text-[var(--muted)]">{`curl -s http://127.0.0.1:8000/v1/capabilities
curl -s -F file=@clip.wav http://127.0.0.1:8000/analyze`}</pre>
      </section>

      <section className="card p-6 sm:p-8">
        <div className="kicker">Adapters</div>
        <h2 className="font-serif mt-3 text-3xl">Call demo and bank demo consume the same Core.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
          The call adapter streams laptop mic audio into Core (stand-in for a dialler). The bank
          adapter runs a high-value transfer story and applies Hold / MFA when risk is high
          (stand-in for core banking). Neither is VoxShield itself.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/demo" className="btn-primary">
            Judge demo
          </Link>
          <Link href="/monitor" className="btn-ghost">
            Call adapter
          </Link>
          <Link href="/adapters/bank" className="btn-ghost">
            Bank adapter
          </Link>
          <Link href="/operations" className="btn-ghost">
            Ops curl panel
          </Link>
        </div>
      </section>

      <section className="card p-6 sm:p-8">
        <div className="kicker">Standouts</div>
        <h2 className="font-serif mt-3 text-3xl">What judges should remember.</h2>
        <ul className="mt-4 space-y-2 text-sm leading-7 text-[var(--muted)]">
          <li>Evidence Brief — why the verdict, not only the rings.</li>
          <li>Bank auto Hold / MFA on high fraud — host policy, not Core banking.</li>
          <li>DSP voiceprint Match/Mismatch — cross-session card, method dsp_features_v1.</li>
          <li>Context enrichment into Core — unknown number / high-value boost fraud only.</li>
          <li>Incident audit seal — SHA-256 over feature-only fields.</li>
        </ul>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <div className="kicker">Models (honest)</div>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            Stage 1: AST (ASVspoof5) + wav2vec2 + DSP — not classic AASIST weights. Stage 2:
            SilverGuard ONNX + bilingual lexicon. Speaker check is <strong>DSP voiceprint only</strong>,
            not ECAPA-TDNN. We do not claim full dialect coverage — Whisper auto-detect + EN/HI lexicon.
          </p>
        </div>
        <div className="card p-6">
          <div className="kicker">Privacy</div>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            Default retention is features, score, timestamp. Raw audio is not kept by Core.
          </p>
        </div>
      </section>
    </div>
  );
}
