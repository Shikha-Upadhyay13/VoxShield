"use client";

import { useState } from "react";
import Link from "next/link";
import { PageIntro } from "@/components/atmosphere";
import { EvidenceBrief } from "@/components/evidence-brief";
import { RiskRing } from "@/components/risk-ring";
import { scoreText } from "@/sdk";
import type { EngineOk } from "@/lib/types";

const DEMOS = [
  {
    id: "family",
    title: "Family UPI",
    blurb: "Urgent transfer request from a parent-like voice.",
    transcript:
      "Beta, mujhe abhi paise chahiye. UPI pe do lakh bhej do. Kisi ko mat batana. OTP bhej dena jaldi.",
  },
  {
    id: "cfo",
    title: "CFO wire",
    blurb: "High-value vendor payout under time pressure.",
    transcript:
      "This is Rohan, the CFO. Transfer twelve lakh forty thousand to the vendor now. Do not call anyone. Send me the OTP from the bank SMS.",
  },
  {
    id: "otp",
    title: "OTP tax",
    blurb: "Official-sounding freeze threat + OTP harvest.",
    transcript:
      "Income Tax department. Confirm the OTP I just sent or your account will be frozen within thirty minutes.",
  },
] as const;

export default function JudgeDemoPage() {
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [result, setResult] = useState<EngineOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<string | null>(null);

  async function run(id: (typeof DEMOS)[number]["id"]) {
    const demo = DEMOS.find((d) => d.id === id);
    if (!demo) return;
    setBusy(true);
    setActiveId(id);
    setError(null);
    setPolicy(null);
    try {
      const scored = await scoreText(demo.transcript, {
        preset: id === "family" ? "standard" : "high_value",
        context: {
          unknownNumber: true,
          knownContact: false,
          highValue: id !== "family",
          callOrigin: "unknown",
        },
      });
      setResult(scored);
      if (
        scored.verdict === "critical" ||
        scored.verdict === "fraud_human" ||
        scored.fraud.band === "high"
      ) {
        setPolicy("Host preview: auto Hold + MFA / callback before any transfer.");
      } else if (scored.verdict === "review") {
        setPolicy("Host preview: soft warn + secondary verification.");
      } else {
        setPolicy("Host preview: continue under normal controls.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Core unreachable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageIntro
        kicker="Judge demo"
        title="One click. No mic required."
        body="Three canned scam scripts hit POST /score-text. Evidence Brief + host policy preview — the viva path when the room is noisy."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <section className="space-y-3">
          {DEMOS.map((demo) => (
            <button
              key={demo.id}
              type="button"
              disabled={busy}
              onClick={() => void run(demo.id)}
              className="card w-full p-5 text-left transition hover:-translate-y-0.5"
            >
              <div className="kicker">{demo.id === activeId && busy ? "Scoring…" : "Scenario"}</div>
              <div className="font-serif mt-2 text-2xl">{demo.title}</div>
              <p className="mt-2 text-sm text-[var(--muted)]">{demo.blurb}</p>
            </button>
          ))}
        </section>

        <aside className="card space-y-4 p-5">
          <div className="kicker">Core contract</div>
          <pre className="overflow-x-auto rounded-xl border border-[var(--line)] bg-black/40 p-3 font-mono text-[11px] leading-5 text-[var(--muted)]">{`curl -s http://127.0.0.1:8000/v1/capabilities
curl -s -F text="send OTP now" \\
  -F preset=high_value \\
  http://127.0.0.1:8000/score-text`}</pre>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href="/guide" className="text-[var(--accent)]">
              Guide
            </Link>
            <Link href="/adapters/bank" className="text-[var(--accent)]">
              Bank adapter
            </Link>
            <Link href="/monitor" className="text-[var(--accent)]">
              Call adapter
            </Link>
          </div>
          {error ? <p className="text-sm text-[var(--high)]">{error}</p> : null}
          {policy ? (
            <p className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-dim)] px-3 py-2 text-xs text-[var(--accent)]">
              {policy}
            </p>
          ) : null}
        </aside>
      </div>

      {result ? (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="card flex flex-col items-center gap-6 p-6">
            <RiskRing title="Authenticity" score={result.authenticity.score} band={result.authenticity.band} size={140} />
            <RiskRing title="Fraud" score={result.fraud.score} band={result.fraud.band} size={140} />
          </div>
          <EvidenceBrief result={result} />
        </div>
      ) : null}
    </div>
  );
}
