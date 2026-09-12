"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneOff, PhoneIncoming, RefreshCw, Shield } from "lucide-react";
import {
  AuthenticityPanel,
  EngineBadge,
  FraudPanel,
  SignalTable,
  VerdictBanner,
} from "@/components/detection-report";
import { InstallBanner } from "@/components/install-banner";
import { RiskRing } from "@/components/risk-ring";
import { ScoreTimeline } from "@/components/score-timeline";
import { SpectrogramBars, Waveform } from "@/components/waveform";
import { clsx } from "@/lib/format";
import { engineToLegacy, isOk, scoreText } from "@/lib/engine-client";
import { ensureNotificationPermission, isThreatVerdict, notifyThreat } from "@/lib/threat-notify";
import { useEngine } from "@/hooks/use-engine";
import { useLiveCaptions } from "@/hooks/use-live-captions";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useSession } from "@/store/session-provider";
import type { EngineOk, EngineResponse, Verdict } from "@/lib/types";

function mergeTextFraud(audio: EngineOk | null, textResult: EngineOk): EngineOk {
  if (!audio || audio.authenticity.degraded || audio.authenticity.signals.length === 0) {
    return textResult;
  }
  const verdict = pickVerdict(audio.authenticity.score, textResult.fraud.score);
  return {
    ...audio,
    fraud: textResult.fraud,
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
  const [phase, setPhase] = useState<"ringing" | "listening" | "analysing" | "cut" | "idle">(
    "ringing",
  );
  const [result, setResult] = useState<EngineOk | null>(null);
  const [insufficient, setInsufficient] = useState<string | null>(null);
  const captions = useLiveCaptions(session.active);
  const lastScoredText = useRef("");
  const lastNotified = useRef<string>("");
  const scoreAbort = useRef<AbortController | null>(null);

  const cutCall = useCallback(
    (reason: string) => {
      live.stop();
      stopSession();
      setPhase("cut");
      setNotice(reason);
      captions.clear();
    },
    [live, stopSession, captions],
  );

  const handleResult = useCallback(
    (next: EngineResponse, tMs: number) => {
      if (phase === "cut") return;
      setPhase("listening");
      if (isOk(next)) {
        setResult((prev) => {
          let merged: EngineOk = next;
          const audioWords = (next.fraud.transcript || "").trim();
          if (
            prev?.fraud.transcript &&
            prev.fraud.score > next.fraud.score &&
            audioWords.split(/\s+/).filter(Boolean).length < 4
          ) {
            merged = {
              ...next,
              fraud: prev.fraud,
              verdict: pickVerdict(next.authenticity.score, prev.fraud.score),
            };
          }
          updateLive({
            result: engineToLegacy(merged),
            insufficient: false,
            appendPoint: { tMs, score: merged.authenticity.score },
            label: "Live call window",
            source: "live",
          });
          return merged;
        });
        setInsufficient(null);
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
    [updateLive, phase],
  );

  useEffect(() => {
    live.updateOptions({
      context,
      preset,
      language: null,
      onLevel: (inputLevel) => updateLive({ inputLevel }),
      onResult: handleResult,
      onNotice: (message) => {
        if (engine.health?.warming) {
          setNotice("Engine waking up… hang on a few seconds, then try again.");
          return;
        }
        setNotice(message);
      },
      onAnalysing: () => setPhase((p) => (p === "cut" ? p : "analysing")),
    });
  }, [context, preset, live.updateOptions, updateLive, handleResult, engine.health?.warming]);

  // Caption fraud path with abort on newer text.
  useEffect(() => {
    if (!session.active || phase === "cut") {
      lastScoredText.current = "";
      return;
    }
    const allWords = captions.transcript.trim().split(/\s+/).filter(Boolean);
    if (allWords.length < 4) return;
    const text = allWords.slice(-55).join(" ");
    if (text === lastScoredText.current) return;

    const timer = window.setTimeout(() => {
      lastScoredText.current = text;
      scoreAbort.current?.abort();
      const controller = new AbortController();
      scoreAbort.current = controller;
      void scoreText(text, { preset })
        .then((scored) => {
          if (controller.signal.aborted) return;
          setResult((prev) => {
            const merged = mergeTextFraud(prev, scored);
            updateLive({
              result: engineToLegacy(merged),
              insufficient: false,
              label: "Live captions",
              source: "live",
            });
            return merged;
          });
          setPhase((p) => (p === "cut" ? p : "listening"));
        })
        .catch(() => {
          if (engine.health?.warming || engine.state === "offline") {
            setNotice("Engine waking up… captions still appear; scoring resumes when ready.");
          }
        });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    captions.finalText,
    captions.transcript,
    session.active,
    preset,
    updateLive,
    phase,
    engine.health?.warming,
    engine.state,
  ]);

  // Threat notifications + auto-cut on critical.
  useEffect(() => {
    if (!result || phase === "cut") return;
    const key = `${result.verdict}:${result.fraud.score}`;
    if (isThreatVerdict(result.verdict) && key !== lastNotified.current) {
      lastNotified.current = key;
      void notifyThreat({
        verdict: result.verdict,
        fraudScore: result.fraud.score,
        summary: result.fraud.transcript || undefined,
      });
    }
    if (result.verdict === "critical") {
      cutCall("Call blocked by VoxShield — critical clone + scam speech.");
    }
  }, [result, phase, cutCall]);

  async function beginListening() {
    setBusy(true);
    setResult(null);
    setInsufficient(null);
    setNotice(null);
    live.setError(null);
    captions.clear();
    lastScoredText.current = "";
    lastNotified.current = "";
    void ensureNotificationPermission();
    try {
      if (engine.state === "offline" || engine.health?.warming) {
        setNotice("Engine waking up… retrying health before the mic opens.");
        await engine.refresh();
      }
      startSession("live", "Call Shield");
      setPhase("listening");
      await live.start({
        context,
        preset,
        language: null,
        onLevel: (inputLevel) => updateLive({ inputLevel }),
        onResult: handleResult,
        onNotice: setNotice,
        onAnalysing: () => setPhase("analysing"),
      });
    } catch {
      live.setError(
        "Microphone permission was denied. Call Shield needs mic access while this screen stays open.",
      );
      stopSession();
      setPhase("ringing");
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    if (session.active) {
      live.stop();
      stopSession();
      setPhase("ringing");
      return;
    }
    await beginListening();
  }

  async function freshRecording() {
    if (session.active) {
      live.stop();
      stopSession();
    }
    setPhase("ringing");
    setResult(null);
    setNotice(null);
    captions.clear();
    await beginListening();
  }

  const liveWords = captions.transcript;
  const engineWords = result?.fraud.transcript?.trim() || null;
  const displayTranscript = liveWords || engineWords;
  const canFresh = Boolean(session.active || result || displayTranscript || live.error || notice);
  const warming = Boolean(engine.health?.warming) || engine.state === "checking";
  const threat =
    result && (result.verdict === "fraud_human" || result.verdict === "critical" || result.fraud.band === "high");

  if (phase === "ringing" && !session.active && !result) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-5 px-1">
        <InstallBanner />
        <section className="card frame relative overflow-hidden p-8 text-center sm:p-10">
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                "radial-gradient(circle at 50% 20%, rgba(124,232,204,0.16), transparent 55%)",
            }}
          />
          <div className="relative">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10">
              <PhoneIncoming className="h-9 w-9 animate-pulse text-[var(--accent)]" />
            </div>
            <div className="kicker">Incoming call</div>
            <h1 className="font-serif mt-3 text-3xl sm:text-4xl">Unknown number</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">
              Accept to open Call Shield. Keep this screen in the foreground — the mic cannot
              stay live in the background.
            </p>
            {warming ? (
              <p className="mt-4 text-xs text-[var(--review)]">Engine waking up…</p>
            ) : null}
            {!engine.health?.calibrated && engine.state === "online" ? (
              <p className="mt-2 text-[11px] text-[var(--faint)]">
                Authenticity not calibrated yet — fraud scoring still runs.
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void beginListening()}
              className="btn-primary mt-8 w-full sm:w-auto"
            >
              <Shield size={16} />
              {busy ? "Opening mic…" : "Accept & protect"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (phase === "cut") {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-5">
        <section className="card frame border-[var(--high)]/50 bg-[var(--high)]/10 p-8 text-center sm:p-10">
          <PhoneOff className="mx-auto h-12 w-12 text-[var(--high)]" />
          <h1 className="font-serif mt-5 text-3xl text-[var(--high)]">Call blocked</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {notice || "VoxShield cut the line on a critical threat."}
          </p>
          <button type="button" className="btn-primary mt-8" onClick={() => setPhase("ringing")}>
            New call
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <InstallBanner />

      {threat ? (
        <div className="animate-in fade-in slide-in-from-top-2 rounded-xl border border-[var(--high)]/45 bg-[var(--high)]/15 px-4 py-3 text-sm text-[var(--high)]">
          Threat on this call — hang up and call back on a number you already saved.
        </div>
      ) : null}

      {result ? <VerdictBanner verdict={result.verdict} confidence={result.confidence} /> : null}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="card frame flex flex-col p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Call Shield</div>
              <div className="text-xs text-[var(--faint)]">
                Live authenticity + fraud while you stay on this screen.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void freshRecording()}
                disabled={busy || !canFresh}
                title="Fresh recording"
                aria-label="Fresh recording"
                className="btn-ghost !px-2.5 !py-2 disabled:opacity-40"
              >
                <RefreshCw className={clsx("h-4 w-4", busy && "animate-spin")} />
              </button>
              <button
                type="button"
                onClick={() => void toggle()}
                disabled={busy}
                className={clsx(
                  session.active
                    ? "btn-ghost !border-[rgba(239,68,68,0.45)] !text-[var(--high)]"
                    : "btn-primary",
                  "!py-2",
                )}
              >
                {session.active ? "End call" : busy ? "Requesting mic…" : "Start shield"}
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
                Engine analysing… captions keep updating.
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
            <EngineBadge
              source={live.usingFallback ? "browser-fallback" : "engine"}
              profile={engine.health?.profile}
              latencyMs={result?.meta.latency_ms}
            />
          </div>

          {warming ? (
            <p className="mt-3 rounded-lg border border-[var(--review)]/40 bg-[var(--review)]/10 p-3 text-xs text-[var(--review)]">
              Engine waking up… fraud scoring resumes when SilverGuard is ready.
            </p>
          ) : null}
          {live.error ? <p className="mt-3 text-sm text-[var(--high)]">{live.error}</p> : null}
          {notice && !warming ? (
            <p className="mt-3 rounded-lg border border-[var(--review)]/40 bg-[var(--review)]/10 p-3 text-xs leading-5 text-[var(--review)]">
              {notice}
            </p>
          ) : null}

          <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="kicker">Live transcript</div>
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
                </>
              ) : (
                "Speak — words appear here as you talk."
              )}
            </p>
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

          <div className="mt-5 flex flex-wrap gap-2">
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
              Green = human · Red = synthetic
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
              Green = safe · Red = scam speech
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
