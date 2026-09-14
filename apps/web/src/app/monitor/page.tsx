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
import { EvidenceBrief } from "@/components/evidence-brief";
import { IdentityChip } from "@/components/identity-chip";
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
import { usePreferences } from "@/store/preferences-provider";
import { useSession } from "@/store/session-provider";
import { VERDICT_COPY, type EngineOk, type EngineResponse, type Verdict } from "@/lib/types";

const FRAUD_MEASURES = [
  "Hang up immediately — do not stay on the line to argue.",
  "Call back only on a number you already saved (not one the caller gives).",
  "Never share OTP, UPI PIN, CVV, or remote-access codes.",
  "Do not transfer money or approve a payout until verified out-of-band.",
  "Tell a family member or supervisor; banks: Hold + MFA / escalate.",
];

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
  const { context, setContext, preset, session, startSession, updateLive, stopSession, enrollment } =
    useSession();
  const { features } = usePreferences();
  const engine = useEngine();
  const live = useLiveStream();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [phase, setPhase] = useState<"ringing" | "listening" | "analysing" | "cut" | "idle">(
    "ringing",
  );
  const [result, setResult] = useState<EngineOk | null>(null);
  const [insufficient, setInsufficient] = useState<string | null>(null);
  const captions = useLiveCaptions(session.active && features.liveCaptions);
  const lastScoredText = useRef("");
  const lastNotified = useRef<string>("");
  const scoreAbort = useRef<AbortController | null>(null);

  const [manualText, setManualText] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

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
      void scoreText(text, {
        preset,
        context: {
          unknownNumber: context.unknownNumber,
          knownContact: !context.unknownNumber && !context.firstTimeCaller,
          highValue: preset === "high_value",
          callOrigin: context.unknownNumber ? "unknown" : "saved_contact",
        },
      })
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

  // Threat notifications + auto-cut on critical (respect Settings).
  useEffect(() => {
    if (!result || phase === "cut") return;
    const key = `${result.verdict}:${result.fraud.score}`;
    if (
      features.threatAlerts &&
      features.notifications &&
      isThreatVerdict(result.verdict) &&
      key !== lastNotified.current
    ) {
      lastNotified.current = key;
      void notifyThreat({
        verdict: result.verdict,
        fraudScore: result.fraud.score,
        summary: result.fraud.transcript || undefined,
      });
    }
    if (features.autoCut && result.verdict === "critical") {
      cutCall("Call blocked by VoxShield — critical clone + scam speech.");
    }
  }, [result, phase, cutCall, features.autoCut, features.threatAlerts, features.notifications]);

  async function beginListening() {
    if (!features.microphone) {
      setNotice("Microphone is off in Settings — turn it on under Permissions / Features.");
      return;
    }
    setBusy(true);
    setResult(null);
    setInsufficient(null);
    setNotice(null);
    live.setError(null);
    captions.clear();
    lastScoredText.current = "";
    lastNotified.current = "";
    if (features.notifications || features.threatAlerts) {
      void ensureNotificationPermission();
    }
    try {
      if (engine.state === "offline" || engine.health?.warming) {
        setNotice("Engine waking up… retrying health before the mic opens.");
        await engine.refresh();
      }
      startSession("live", "Call adapter");
      setPhase("listening");
      await live.start({
        context,
        preset,
        language: null,
        enrollment,
        onLevel: (inputLevel) => updateLive({ inputLevel }),
        onResult: handleResult,
        onNotice: setNotice,
        onAnalysing: () => setPhase("analysing"),
      });
      if (engine.health && engine.health.models?.whisper === false) {
        setNotice(
          "Whisper transcription is unavailable on this machine — live fraud needs browser captions or the typed box below. Authenticity still scores from the mic.",
        );
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      const message =
        name === "NotAllowedError"
          ? "Microphone permission denied. Click the lock icon in the address bar → allow microphone for localhost:3000, then try again."
          : name === "NotFoundError"
            ? "No microphone found. Plug in a mic or select the right input in Windows sound settings."
            : "Could not open the microphone. Keep this tab in the foreground and allow mic access.";
      live.setError(message);
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

  async function scoreManualTranscript() {
    const text = manualText.trim();
    if (text.length < 4) {
      setNotice("Type a few words (or a scam script) to score fraud.");
      return;
    }
    setManualBusy(true);
    try {
      const scored = await scoreText(text, {
        preset,
        context: {
          unknownNumber: context.unknownNumber,
          knownContact: !context.unknownNumber && !context.firstTimeCaller,
          highValue: preset === "high_value",
          callOrigin: context.unknownNumber ? "unknown" : "saved_contact",
        },
      });
      setResult((prev) => {
        const merged = mergeTextFraud(prev, scored);
        updateLive({
          result: engineToLegacy(merged),
          insufficient: false,
          label: "Typed transcript",
          source: "live",
        });
        return merged;
      });
      setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not score transcript.");
    } finally {
      setManualBusy(false);
    }
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
        <div className="rounded-xl border border-[var(--line)] bg-black/25 px-4 py-3 text-left text-xs leading-5 text-[var(--muted)]">
          <span className="font-medium text-[var(--accent)]">Demo host: Call Adapter</span>
          {" — "}
          Mic audio streams to Core via <code className="font-mono text-[var(--text)]">WS /stream</code>.
          This is not a dialler product; auto-cut is host policy simulated here.
        </div>
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
            <div className="kicker">Simulated incoming call</div>
            <h1 className="font-serif mt-3 text-3xl sm:text-4xl">Unknown number</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">
              Accept to stream the laptop mic into VoxShield Core. Keep this screen in the
              foreground — the mic cannot stay live in the background.
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
              {busy ? "Opening mic…" : "Accept & stream to Core"}
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
          <h1 className="font-serif mt-5 text-3xl text-[var(--high)]">Host cut the call</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {notice || "Adapter simulated auto-cut on a critical Core verdict — not a Core feature."}
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-black/25 px-4 py-3">
        <div className="text-xs leading-5 text-[var(--muted)]">
          <span className="font-medium text-[var(--accent)]">Demo host: Call Adapter</span>
          {" · "}
          mic → Core SDK / WebSocket · dual scores · host policy for warn / cut
        </div>
        <a href="/adapters/bank" className="text-[11px] text-[var(--accent)]">
          Bank adapter →
        </a>
      </div>

      {threat ? (
        <div className="animate-in fade-in slide-in-from-top-2 rounded-xl border border-[var(--high)]/45 bg-[var(--high)]/15 px-4 py-3 text-sm text-[var(--high)]">
          Threat on this call — hang up and call back on a number you already saved.
        </div>
      ) : null}

      {result ? <VerdictBanner verdict={result.verdict} confidence={result.confidence} /> : null}
      {result ? <EvidenceBrief result={result} timeline={session.timeline} /> : null}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="card frame flex flex-col p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium">Call adapter (demo)</div>
                <IdentityChip identity={result?.identity} />
              </div>
              <div className="text-xs text-[var(--faint)]">
                Live authenticity + fraud from Core while you stay on this screen.
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
                {session.active ? "End stream" : busy ? "Requesting mic…" : "Start stream"}
              </button>
            </div>
          </div>

          <div
            className={clsx(
              "relative overflow-hidden rounded-2xl border bg-black/35 p-3 transition-colors",
              threat ? "border-[var(--high)]/55 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]" : "border-[var(--line)]",
            )}
          >
            <div className="scanline" />
            <Waveform analyser={live.analyser} idle={!session.active} threat={Boolean(threat)} />
            <div className="mt-3">
              <SpectrogramBars analyser={live.analyser} idle={!session.active} threat={Boolean(threat)} />
            </div>
            {phase === "analysing" ? (
              <div
                className={clsx(
                  "pointer-events-none absolute inset-x-3 bottom-3 rounded-lg border bg-black/70 px-3 py-2 text-[11px]",
                  threat
                    ? "border-[var(--high)]/40 text-[var(--high)]"
                    : "border-[var(--accent)]/30 text-[var(--accent)]",
                )}
              >
                {threat ? "Threat on line — follow measures below." : "Engine analysing… captions keep updating."}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">Input</div>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
              <div
                className={clsx("h-full rounded-full transition-colors", threat ? "bg-[var(--high)]" : "bg-[var(--accent)]")}
                style={{ width: `${Math.round(session.inputLevel * 100)}%` }}
              />
            </div>
            <EngineBadge
              source={live.usingFallback ? "browser-fallback" : "engine"}
              profile={engine.health?.profile}
              latencyMs={result?.meta.latency_ms}
              warming={warming}
              calibrated={engine.health?.calibrated}
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

          <div
            className={clsx(
              "mt-5 rounded-xl border bg-black/25 p-4 transition-colors",
              threat ? "border-[var(--high)]/40" : "border-white/10",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="kicker">Live transcript</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">
                Captions · {captions.status}
              </div>
            </div>
            {captions.statusDetail ? (
              <p className="mt-2 text-xs leading-5 text-[var(--review)]">{captions.statusDetail}</p>
            ) : null}
            <p
              className={clsx(
                "mt-3 min-h-[4.5rem] font-serif text-xl leading-8",
                displayTranscript
                  ? threat
                    ? "text-[var(--high)]"
                    : "text-[var(--fg)]"
                  : "text-[var(--muted)]",
              )}
            >
              {displayTranscript ? (
                <>
                  <span>{captions.finalText || (!captions.liveLine ? displayTranscript : "")}</span>
                  {captions.liveLine ? (
                    <span className={threat ? "text-[var(--high)]" : "text-[var(--accent)]"}>
                      {captions.finalText ? " " : ""}
                      {captions.liveLine}
                    </span>
                  ) : null}
                </>
              ) : (
                "Speak clearly — words should appear here. If they do not, type below (Whisper may be blocked on this PC)."
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

            {threat && result ? (
              <div className="mt-4 rounded-xl border border-[var(--high)]/40 bg-[var(--high)]/10 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--high)]">
                  Measures to take
                </div>
                <p className="mt-2 text-sm font-medium text-[var(--text)]">
                  {VERDICT_COPY[result.verdict].action}
                </p>
                <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-6 text-[var(--muted)]">
                  {FRAUD_MEASURES.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-[var(--faint)]">{VERDICT_COPY[result.verdict].hindi}</p>
              </div>
            ) : null}

            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="kicker">Type what was said</div>
              <p className="mt-1 text-[11px] text-[var(--faint)]">
                Fallback when browser captions fail — scores fraud via POST /score-text.
              </p>
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                rows={3}
                placeholder="e.g. Send the OTP now, transfer two lakh…"
                className="mt-2 w-full resize-y rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/40"
              />
              <button
                type="button"
                className="btn-primary mt-2 !py-1.5 !text-xs"
                disabled={manualBusy}
                onClick={() => void scoreManualTranscript()}
              >
                {manualBusy ? "Scoring…" : "Score typed words"}
              </button>
            </div>
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

      {result ? (
        <section className="card p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
              Raw Core payload
            </div>
            <div className="font-mono text-[10px] text-[var(--faint)]">
              WS /stream · POST /score-text
            </div>
          </div>
          <pre className="max-h-72 overflow-auto font-mono text-[11px] leading-5 text-[var(--muted)]">
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
