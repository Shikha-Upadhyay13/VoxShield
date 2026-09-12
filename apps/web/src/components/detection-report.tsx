"use client";

import { RiskRing } from "@/components/risk-ring";
import { clsx } from "@/lib/format";
import { topReasons } from "@/lib/engine-client";
import {
  VERDICT_COPY,
  VERDICT_LABEL,
  type EngineOk,
  type EngineSignal,
  type ScoreBand,
  type Verdict,
} from "@/lib/types";

const TONE_CLASS: Record<ScoreBand | "insufficient", string> = {
  genuine: "border-[var(--genuine)]/40 bg-[var(--genuine)]/10 text-[var(--genuine)]",
  review: "border-[var(--review)]/40 bg-[var(--review)]/10 text-[var(--review)]",
  high: "border-[var(--high)]/40 bg-[var(--high)]/10 text-[var(--high)]",
  insufficient: "border-white/15 bg-white/5 text-[var(--muted)]",
};

const CATEGORY_LABEL: Record<string, string> = {
  credentials: "Credentials",
  coercion: "Threats",
  secrecy: "Secrecy",
  urgency: "Urgency",
  money: "Money",
  authority: "Authority",
};

export function VerdictBanner({ verdict, confidence }: { verdict: Verdict; confidence: number }) {
  const copy = VERDICT_COPY[verdict];
  return (
    <div className={clsx("frame rounded-xl border p-5", TONE_CLASS[copy.tone])}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-current/30 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em]">
          {VERDICT_LABEL[verdict]}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] opacity-70">
          Confidence {Math.round(confidence * 100)}%
        </span>
      </div>
      <div className="mt-3 font-serif text-2xl leading-snug">{copy.headline}</div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{copy.body}</p>
      <p className="mt-3 text-sm font-medium">{copy.action}</p>
      <p className="mt-1 text-xs text-[var(--faint)]">{copy.hindi}</p>
    </div>
  );
}

function SuspicionBar({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-[11px] text-[var(--faint)]">not measured</span>;
  }
  const pct = Math.round(value * 100);
  const color = value >= 0.6 ? "var(--high)" : value >= 0.3 ? "var(--review)" : "var(--genuine)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-8 font-mono text-[11px]" style={{ color }}>
        {pct}
      </span>
    </div>
  );
}

function formatValue(signal: EngineSignal): string {
  if (signal.value === null) return "—";
  const rounded =
    Math.abs(signal.value) >= 100 ? Math.round(signal.value) : Number(signal.value.toFixed(2));
  if (signal.unit === "Hz" && signal.value >= 1000) return `${(signal.value / 1000).toFixed(1)} kHz`;
  return signal.unit ? `${rounded} ${signal.unit}` : `${rounded}`;
}

export function SignalTable({ signals }: { signals: EngineSignal[] }) {
  const measured = signals.filter((s) => s.suspicion !== null);
  const skipped = signals.filter((s) => s.suspicion === null);
  const ordered = [...measured].sort((a, b) => (b.suspicion ?? 0) - (a.suspicion ?? 0));

  return (
    <div className="card p-5">
      <div className="kicker">Why this score</div>
      <p className="mt-2 text-xs leading-5 text-[var(--faint)]">
        Each signal is measured independently. Nothing here can decide the verdict alone.
      </p>
      <div className="mt-4 space-y-3">
        {ordered.map((signal) => (
          <div key={signal.key} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{signal.label}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-[var(--muted)]">
                  {formatValue(signal)}
                </span>
                <SuspicionBar value={signal.suspicion} />
              </div>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{signal.reason}</p>
          </div>
        ))}
      </div>

      {skipped.length > 0 ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
            Not measured in this window
          </div>
          <ul className="mt-2 space-y-1">
            {skipped.map((signal) => (
              <li key={signal.key} className="text-xs leading-5 text-[var(--faint)]">
                <span className="text-[var(--muted)]">{signal.label}:</span> {signal.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ComponentRow({
  label,
  score,
  detail,
}: {
  label: string;
  score: number | null;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0">
      <div>
        <div className="text-sm">{label}</div>
        {detail ? <div className="text-[11px] text-[var(--faint)]">{detail}</div> : null}
      </div>
      <SuspicionBar value={score} />
    </div>
  );
}

export function FraudPanel({ result }: { result: EngineOk }) {
  const { fraud } = result;
  const { classifier, lexicon, amount } = fraud.components;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div className="kicker">Stage 2 · Fraud content</div>
        <span className="font-mono text-[11px] text-[var(--muted)]">{fraud.score}/100</span>
      </div>

      {!fraud.transcript_available ? (
        <p className="mt-3 text-xs leading-5 text-[var(--review)]">
          No transcript was produced, so the words were never assessed. Only the voice itself was
          analysed.
        </p>
      ) : null}

      <div className="mt-3">
        <ComponentRow
          label="Scam classifier"
          score={classifier.score}
          detail={classifier.model ? `${classifier.model} · Indian scam patterns` : "unavailable"}
        />
        <ComponentRow
          label="Keyword categories"
          score={lexicon.score}
          detail={
            lexicon.categories.length > 0
              ? lexicon.categories.map((c) => CATEGORY_LABEL[c] ?? c).join(", ")
              : "no categories matched"
          }
        />
        <ComponentRow
          label="Amount demanded"
          score={amount.score}
          detail={
            amount.detected_inr
              ? `₹${amount.detected_inr.toLocaleString("en-IN")}${amount.raw ? ` ("${amount.raw}")` : ""}`
              : "no amount mentioned"
          }
        />
      </div>

      {fraud.matched_terms.length > 0 ? (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
            Phrases that triggered this
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {fraud.matched_terms.map((term) => (
              <span
                key={`${term.category}-${term.term}`}
                className="rounded-full border border-[var(--high)]/30 bg-[var(--high)]/10 px-2.5 py-1 text-[11px] text-[var(--high)]"
              >
                {term.term}
                <span className="ml-1 opacity-60">{CATEGORY_LABEL[term.category] ?? term.category}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {fraud.category ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Pattern looks like: <span className="text-[var(--fg)]">{fraud.category}</span>
        </p>
      ) : null}

      {fraud.transcript ? (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
            What was said
          </div>
          <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm leading-6 text-[var(--fg)]">
            {fraud.transcript}
          </p>
        </div>
      ) : fraud.transcript_available ? (
        <p className="mt-4 text-xs text-[var(--muted)]">
          Speech was detected, but the transcript was not returned in this response.
        </p>
      ) : null}
    </div>
  );
}

export function AuthenticityPanel({ result }: { result: EngineOk }) {
  const { neural, dsp, disfluency } = result.authenticity.components;
  const models = Object.entries(neural.models);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div className="kicker">Stage 1 · Voice authenticity</div>
        <span className="font-mono text-[11px] text-[var(--muted)]">
          {result.authenticity.score}/100
        </span>
      </div>

      {result.authenticity.degraded ? (
        <p className="mt-3 text-xs leading-5 text-[var(--review)]">
          Running without the neural models. The score comes from acoustic measurements alone, so
          treat it as weaker evidence.
        </p>
      ) : null}

      <div className="mt-3">
        <ComponentRow
          label="Neural detectors"
          score={neural.score}
          detail={
            models.length > 0
              ? models
                  .map(([key, value]) => `${key} ${value === null ? "n/a" : value.toFixed(2)}`)
                  .join(" · ")
              : "not loaded"
          }
        />
        <ComponentRow label="Acoustic signals" score={dsp.score} detail="pitch, jitter, pauses, spectrum" />
        <ComponentRow
          label="Hesitation"
          score={disfluency.score}
          detail="absence of um / uh / matlab"
        />
      </div>

      {neural.disagreement !== null && neural.disagreement > 0.5 ? (
        <p className="mt-3 text-xs leading-5 text-[var(--review)]">
          The two detectors disagree by {neural.disagreement.toFixed(2)}. Confidence is reduced and
          the acoustic signals carry more weight.
        </p>
      ) : null}
    </div>
  );
}

export function EngineBadge({
  source,
  latencyMs,
  profile,
  warming,
  calibrated,
}: {
  source?: string;
  latencyMs?: number;
  profile?: string;
  warming?: boolean;
  calibrated?: boolean;
}) {
  const fallback = source === "browser-fallback";
  const tone = fallback || warming ? "review" : "accent";
  return (
    <div
      className={clsx(
        "inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em]",
        tone === "review"
          ? "border-[var(--review)]/40 bg-[var(--review)]/10 text-[var(--review)]"
          : "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]",
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full bg-current", warming && "animate-pulse")} />
      {fallback
        ? "Browser fallback · not the real engine"
        : warming
          ? "Engine waking up…"
          : `Engine${profile ? ` · ${profile}` : ""}`}
      {!fallback && !warming && latencyMs !== undefined ? (
        <span className="opacity-60">{latencyMs} ms</span>
      ) : null}
      {!fallback && calibrated === false ? (
        <span className="opacity-70 normal-case tracking-normal">uncalibrated</span>
      ) : null}
    </div>
  );
}

export function DetectionReport({ result, label }: { result: EngineOk; label?: string }) {
  const reasons = topReasons(result, 2);

  return (
    <div className="space-y-5">
      <VerdictBanner verdict={result.verdict} confidence={result.confidence} />

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="card panel-glow flex flex-col items-center gap-4 p-6">
          <div className="grid w-full grid-cols-2 gap-2">
            <div className="flex flex-col items-center">
              <RiskRing score={result.authenticity.score} band={result.authenticity.band} size={158} />
              <div className="mt-2 text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
                  AI voice
                </div>
                <div className="text-xs text-[var(--muted)]">{result.authenticity.label}</div>
              </div>
            </div>
            <div className="flex flex-col items-center">
              <RiskRing score={result.fraud.score} band={result.fraud.band} size={158} />
              <div className="mt-2 text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
                  Fraud content
                </div>
                <div className="text-xs text-[var(--muted)]">{result.fraud.label}</div>
              </div>
            </div>
          </div>

          {label ? <p className="text-center text-xs text-[var(--faint)]">{label}</p> : null}
          <EngineBadge
            source={result.source}
            latencyMs={result.meta.latency_ms}
            profile={result.meta.profile}
          />
          {reasons.length > 0 ? (
            <ul className="w-full space-y-2">
              {reasons.map((reason) => (
                <li
                  key={reason}
                  className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs leading-5 text-[var(--muted)]"
                >
                  {reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="space-y-5">
          <AuthenticityPanel result={result} />
          <FraudPanel result={result} />
        </div>
      </div>

      <SignalTable signals={result.authenticity.signals} />
    </div>
  );
}
