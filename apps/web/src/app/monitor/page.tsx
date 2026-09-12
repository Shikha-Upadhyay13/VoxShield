"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageIntro } from "@/components/atmosphere";
import {
  AuthenticityPanel,
  EngineBadge,
  FraudPanel,
  SignalTable,
  VerdictBanner,
} from "@/components/detection-report";
import { RiskRing } from "@/components/risk-ring";
import { ScoreTimeline } from "@/components/score-timeline";
import { SpectrogramBars, Waveform } from "@/components/waveform";
import { clsx } from "@/lib/format";
import { engineToLegacy, isOk, scoreText } from "@/lib/engine-client";
import { useEngine } from "@/hooks/use-engine";
import { useLiveCaptions } from "@/hooks/use-live-captions";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useSession } from "@/store/session-provider";
import type { EngineOk, EngineResponse, Verdict } from "@/lib/types";

function mergeTextFraud(audio: EngineOk | null, textResult: EngineOk): EngineOk {
  // Captions arrive first. Keep any real voice score we already have, and always
  // take the stronger fraud reading so a spoken scam script turns the ring red.
  if (!audio || audio.authenticity.degraded || audio.authenticity.signals.length === 0) {
    return textResult;
  }
  const fraud =
    textResult.fraud.score >= audio.fraud.score ? textResult.fraud : audio.fraud;
  const verdict = pickVerdict(audio.authenticity.score, fraud.score);
  return {
    ...audio,
    fraud,
    verdict,
    confidence: Math.max(audio.confidence, textResult.confidence),
  };
}

function pickVerdict(auth: number, fraud: number): Verdict {
  if (auth >= 70 && fraud >= 65) return "critical";
  if (auth < 40 && fraud >= 65) return "fraud_human";
  if (auth >= 70 && fraud < 35) return "synthetic_benign";
  if (auth >= 40 || fraud >= 35) return "review";
  return "clear";
}

export default function MonitorPage() {
  const { context, setContext, preset, session, startSession, updateLive, stopSession } =
    useSession();
  const engine = useEngine();
  const live = useLiveStream();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "listening" | "analysing">("idle");
  const [result, setResult] = useState<EngineOk | null>(null);
  const [insufficient, setInsufficient] = useState<string | null>(null);
  const [language, setLanguage] = useState("");
  const captions = useLiveCaptions(session.active, language);
  const lastScoredText = useRef("");

  const handleResult = useCallback(
    (next: EngineResponse, tMs: number) => {
      setPhase("listening");
      if (isOk(next)) {
        setResult((prev) => {
          // Audio stage owns authenticity; keep a stronger caption-based fraud score
          // if Whisper returned empty or weak fraud on a short window.
          if (prev && prev.fraud.score > next.fraud.score && prev.fraud.transcript) {
            return {
              ...next,
              fraud: prev.fraud,
              verdict: pickVerdict(next.authenticity.score, prev.fraud.score),
            };
          }
          return next;
        });
        setInsufficient(null);
        updateLive({
          result: engineToLegacy(next),
          insufficient: false,
          appendPoint: { tMs, score: next.authenticity.score },
          label: "Live call window",
          source: "live",
        });
        return;
      }
      setInsufficient(next.reason);
      updateLive({
        result: engineToLegacy(next),
        insufficient: true,
        label: "Live call window",
        source: "live",
      });
    },
    [updateLive],
  );

  useEffect(() => {
    live.updateOptions({
      context,
      preset,
      language: language || null,
      onLevel: (inputLevel) => updateLive({ inputLevel }),
      onResult: handleResult,
      onNotice: setNotice,
      onAnalysing: () => setPhase("analysing"),
    });
  }, [context, preset, language, live.updateOptions, updateLive, handleResult]);

  // Score the live caption text for fraud as soon as enough words land.
  useEffect(() => {
    if (!session.active) {
      lastScoredText.current = "";
      return;
    }
    const text = (captions.finalText || captions.transcript).trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 4) return;
    if (text === lastScoredText.current) return;

    const timer = window.setTimeout(() => {
      lastScoredText.current = text;
      void scoreText(text, { preset })
        .then((scored) => {
          setResult((prev) => mergeTextFraud(prev, scored));
          setPhase("listening");
          updateLive({
            result: engineToLegacy(scored),
            insufficient: false,
            label: "Live captions",
            source: "live",
          });
        })
        .catch(() => {
          /* engine may be warming; audio path still runs */
        });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    captions.finalText,
    captions.transcript,
    session.active,
    preset,
    updateLive,
  ]);

  async function toggle() {
    if (session.active) {
      live.stop();
      stopSession();
      setPhase("idle");
      return;
    }
    setBusy(true);
    setResult(null);
    setInsufficient(null);
    setNotice(null);
    captions.clear();
    try {
      startSession("live", "Live call window");
      setPhase("listening");
      await live.start({
        context,
        preset,
        language: language || null,
        onLevel: (inputLevel) => updateLive({ inputLevel }),
        onResult: handleResult,
        onNotice: setNotice,
        onAnalysing: () => setPhase("analysing"),
      });
    } catch {
      live.setError(
        "Microphone permission was denied. Call-protection needs mic access — the same permission a Truecaller-style host would request.",
      );
      stopSession();
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  const liveWords = captions.transcript;
  const engineWords = result?.fraud.transcript?.trim() || null;
  const displayTranscript = liveWords || engineWords;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageIntro
        kicker="Live call path"
        title="Listen on the call, then decide."
        body="After permission, VoxShield scores the ongoing call — clone vs human, scam vs normal speech — and shows what was heard as you speak."
      />

      {result ? (
        <VerdictBanner verdict={result.verdict} confidence={result.confidence} />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="card frame flex flex-col p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Live detection</div>
              <div className="text-xs text-[var(--faint)]">
                Stand-in for a host app&apos;s call stream after the user allows detection.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                Language
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={session.active}
                  className="rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-xs disabled:opacity-50"
                >
                  <option value="" className="bg-[#0a0e14]">
                    Auto
                  </option>
                  <option value="en" className="bg-[#0a0e14]">
                    English
                  </option>
                  <option value="hi" className="bg-[#0a0e14]">
                    Hindi
                  </option>
                </select>
              </label>
              <button
                type="button"
                onClick={toggle}
                disabled={busy}
                className={clsx(
                  session.active
                    ? "btn-ghost !border-[rgba(239,68,68,0.45)] !text-[var(--high)]"
                    : "btn-primary",
                  "!py-2",
                )}
              >
                {session.active
                  ? "End permission"
                  : busy
                    ? "Requesting mic…"
                    : "Allow live detection"}
              </button>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-black/35 p-3">
            <div className="scanline" />
            <Waveform analyser={live.analyser} idle={!session.active} />
            <div className="mt-3">
              <SpectrogramBars analyser={live.analyser} idle={!session.active} />
            </div>
            {phase === "analysing" ? (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg border border-[var(--accent)]/30 bg-black/70 px-3 py-2 text-[11px] text-[var(--accent)]">
                Engine analysing… captions above keep updating while you speak.
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">Input</div>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.round(session.inputLevel * 100)}%` }}
              />
            </div>
            <div className="font-mono text-xs text-[var(--muted)]">
              {Math.round(session.inputLevel * 100)}
            </div>
            <EngineBadge
              source={live.usingFallback ? "browser-fallback" : "engine"}
              profile={engine.health?.profile}
              latencyMs={result?.meta.latency_ms}
            />
          </div>

          {live.error ? <p className="mt-3 text-sm text-[var(--high)]">{live.error}</p> : null}
          {notice ? (
            <p className="mt-3 rounded-lg border border-[var(--review)]/40 bg-[var(--review)]/10 p-3 text-xs leading-5 text-[var(--review)]">
              {notice}
            </p>
          ) : null}

          <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="kicker">Live transcript</div>
              <div className="text-[11px] text-[var(--faint)]">
                {captions.supported
                  ? captions.liveLine
                    ? "Listening…"
                    : session.active
                      ? "Speak — words appear here as you talk"
                      : "Waiting for permission"
                  : "Browser captions unavailable — engine transcript shows after each score"}
              </div>
            </div>
            <p
              className={clsx(
                "mt-3 min-h-[4.5rem] font-serif text-xl leading-8",
                displayTranscript ? "text-[var(--fg)]" : "text-[var(--muted)]",
              )}
            >
              {displayTranscript ? (
                <>
                  <span>{captions.finalText || (!captions.liveLine ? displayTranscript : "")}</span>
                  {captions.liveLine ? (
                    <span className="text-[var(--accent)]">
                      {captions.finalText ? " " : ""}
                      {captions.liveLine}
                    </span>
                  ) : null}
                  {!liveWords && engineWords ? <span>{engineWords}</span> : null}
                </>
              ) : session.active ? (
                "…"
              ) : (
                "Grant live detection, then speak. Captions stream under the waveform."
              )}
            </p>
            {engineWords && liveWords && engineWords !== liveWords ? (
              <p className="mt-2 text-xs leading-5 text-[var(--faint)]">
                Engine heard: <span className="text-[var(--muted)]">{engineWords}</span>
              </p>
            ) : null}
            {result?.fraud.matched_terms.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {result.fraud.matched_terms.map((term) => (
                  <span
                    key={`${term.category}-${term.term}`}
                    className="rounded-full border border-[var(--high)]/35 bg-[var(--high)]/15 px-2.5 py-1 text-[11px] text-[var(--high)]"
                  >
                    {term.term}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
              Call context from the host app
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["unknownNumber", "Unknown number"],
                  ["firstTimeCaller", "First-time caller"],
                  ["urgencyLanguage", "Flagged by analyst"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setContext({ [key]: !context[key] })}
                  className={clsx(
                    "rounded-full border px-3 py-1.5 text-xs",
                    context[key]
                      ? "border-[var(--accent)]/40 bg-[var(--accent-dim)] text-[var(--accent)]"
                      : "border-[var(--line)] text-[var(--muted)]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="card panel-glow flex flex-col items-center justify-center gap-8 p-6">
          <div className="flex flex-col items-center">
            <RiskRing
              title="AI voice"
              score={result?.authenticity.score ?? 0}
              band={result ? result.authenticity.band : "insufficient"}
              size={180}
            />
            <p className="mt-2 max-w-[14rem] text-center text-[11px] leading-4 text-[var(--faint)]">
              <span className="text-[var(--genuine)]">Green</span> = sounds human ·{" "}
              <span className="text-[var(--high)]">Red</span> = sounds synthetic
            </p>
          </div>
          <div className="h-px w-full bg-white/8" />
          <div className="flex flex-col items-center">
            <RiskRing
              title="Fraud"
              score={result?.fraud.score ?? 0}
              band={result ? result.fraud.band : "insufficient"}
              size={180}
            />
            <p className="mt-2 max-w-[14rem] text-center text-[11px] leading-4 text-[var(--faint)]">
              <span className="text-[var(--genuine)]">Green</span> = safe words ·{" "}
              <span className="text-[var(--high)]">Red</span> = scam / fraud language
            </p>
          </div>
          {insufficient && session.active ? (
            <p className="text-center text-[11px] text-[var(--faint)]">{insufficient}</p>
          ) : null}
        </aside>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
            Authenticity over time
          </div>
          <ScoreTimeline points={session.timeline} />
        </div>
        {result ? <FraudPanel result={result} /> : null}
      </div>

      {result ? (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <AuthenticityPanel result={result} />
          <SignalTable signals={result.authenticity.signals} />
        </div>
      ) : null}
    </div>
  );
}
