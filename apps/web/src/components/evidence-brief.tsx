"use client";

import { VERDICT_COPY } from "@/lib/types";
import type { EngineOk, ScorePoint } from "@/lib/types";
import { IdentityChip } from "@/components/identity-chip";

function firstHighRiskSeconds(timeline: ScorePoint[] | undefined, authHigh = 70, fraudHigh = 65): number | null {
  if (!timeline?.length) return null;
  // Timeline tracks authenticity; fraud spikes are often from captions — still useful as first auth alert.
  const hit = timeline.find((p) => p.score >= authHigh);
  if (!hit) return null;
  return Math.round(hit.tMs / 100) / 10;
}

export function EvidenceBrief({
  result,
  timeline,
}: {
  result: EngineOk;
  timeline?: ScorePoint[];
}) {
  const copy = VERDICT_COPY[result.verdict];
  const topSignals = [...result.authenticity.signals]
    .filter((s) => s.suspicion != null)
    .sort((a, b) => (b.suspicion ?? 0) - (a.suspicion ?? 0))
    .slice(0, 3);
  const terms = result.fraud.matched_terms.slice(0, 6);
  const amount = result.fraud.components.amount.detected_inr;
  const seconds = firstHighRiskSeconds(timeline);
  const fraudHighAt = result.fraud.band === "high" || result.fraud.band === "review";

  return (
    <section className="card space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="kicker">Evidence brief</div>
          <h2 className="font-serif mt-1 text-2xl capitalize">
            {result.verdict.replaceAll("_", " ")}
          </h2>
        </div>
        <IdentityChip identity={result.identity} />
      </div>

      <p className="text-sm leading-6 text-[var(--muted)]">{copy.body}</p>
      <p className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-dim)] px-3 py-2 text-sm text-[var(--accent)]">
        Host action: {copy.action}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
            Authenticity signals
          </div>
          {topSignals.length ? (
            <ul className="space-y-2 text-sm text-[var(--muted)]">
              {topSignals.map((s) => (
                <li key={s.key}>
                  <span className="text-[var(--text)]">{s.label}</span>
                  {" — "}
                  {s.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--faint)]">
              {result.authenticity.degraded
                ? "Voice not scored on this pass (text-only or models warming)."
                : "No elevated authenticity signals."}
            </p>
          )}
        </div>
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
            Fraud evidence
          </div>
          <p className="text-sm text-[var(--muted)]">
            Score {result.fraud.score} · {result.fraud.label}
            {amount != null ? ` · ₹${Math.round(amount).toLocaleString("en-IN")}` : ""}
          </p>
          {terms.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {terms.map((t) => (
                <span
                  key={`${t.category}-${t.term}`}
                  className="rounded-full border border-[var(--high)]/35 bg-[var(--high)]/15 px-2.5 py-1 text-[11px] text-[var(--high)]"
                >
                  {t.term}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--faint)]">No lexicon hits on this window.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-[var(--line)] pt-3 text-[11px] text-[var(--faint)]">
        {seconds != null ? <span>First high authenticity ~{seconds}s</span> : null}
        {fraudHighAt ? <span>Fraud band elevated on this result</span> : null}
        {result.context?.enrichment_boost ? (
          <span>Context boost +{result.context.enrichment_boost}</span>
        ) : null}
        <span>Confidence {(result.confidence * 100).toFixed(0)}%</span>
      </div>
    </section>
  );
}
