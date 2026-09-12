"use client";

import { useCallback, useEffect, useState } from "react";
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
import { engineToLegacy, isOk } from "@/lib/engine-client";
import { useEngine } from "@/hooks/use-engine";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useSession } from "@/store/session-provider";
import type { EngineOk, EngineResponse } from "@/lib/types";

export default function MonitorPage() {
  const { context, setContext, preset, session, startSession, updateLive, stopSession } =
    useSession();
  const engine = useEngine();
  const live = useLiveStream();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<EngineOk | null>(null);
  const [insufficient, setInsufficient] = useState<string | null>(null);
  const [language, setLanguage] = useState("");

  const handleResult = useCallback(
    (next: EngineResponse, tMs: number) => {
      if (isOk(next)) {
        setResult(next);
        setInsufficient(null);
        updateLive({
          result: engineToLegacy(next),
          insufficient: false,
          appendPoint: { tMs, score: next.authenticity.score },
          label: "Laptop microphone",
          source: "live",
        });
        return;
      }
      // Never draw a score from silence; say so instead.
      setInsufficient(next.reason);
      updateLive({
        result: engineToLegacy(next),
        insufficient: true,
        label: "Laptop microphone",
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
    });
  }, [context, preset, language, live.updateOptions, updateLive, handleResult]);

  async function toggle() {
    if (session.active) {
      live.stop();
      stopSession();
      return;
    }
    setBusy(true);
    setResult(null);
    setInsufficient(null);
    try {
      startSession("live", "Laptop microphone");
      await live.start({
        context,
        preset,
        language: language || null,
        onLevel: (inputLevel) => updateLive({ inputLevel }),
        onResult: handleResult,
        onNotice: setNotice,
      });
    } catch {
      live.setError("Microphone permission was denied. Use Analyze to upload a clip instead.");
      stopSession();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageIntro
        kicker="Live integrity"
        title="Listen, then decide."
        body="Point a phone playing a clone at the laptop mic — or speak. The engine re-scores a rolling three-second window while the voice is still in the room."
      />

      {result ? (
        <VerdictBanner verdict={result.verdict} confidence={result.confidence} />
      ) : (
        <div className="frame rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-[var(--muted)]">
          {insufficient ??
            (session.active
              ? "Listening. Keep speaking — the first score needs about a second of voiced audio."
              : "Start the microphone to begin a live session.")}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="card frame p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Live stream</div>
              <div className="text-xs text-[var(--faint)]">
                Phone speaker into the laptop mic — or speak directly.
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
                  <option value="" className="bg-[#0a0e14]">Auto</option>
                  <option value="en" className="bg-[#0a0e14]">English</option>
                  <option value="hi" className="bg-[#0a0e14]">Hindi</option>
                </select>
              </label>
              <button
                type="button"
                onClick={toggle}
                disabled={busy}
                className={clsx(
                  session.active
                    ? "btn-ghost !border-[rgba(255,122,112,0.4)] !text-[var(--high)]"
                    : "btn-primary",
                  "!py-2",
                )}
              >
                {session.active ? "Stop session" : busy ? "Requesting mic…" : "Start microphone"}
              </button>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-black/35 p-3">
            <div className="scanline" />
            <Waveform analyser={live.analyser} idle={!session.active} />
            <div className="mt-3">
              <SpectrogramBars analyser={live.analyser} idle={!session.active} />
            </div>
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
          </div>

          {live.error ? <p className="mt-3 text-sm text-[var(--high)]">{live.error}</p> : null}
          {notice ? (
            <p className="mt-3 rounded-lg border border-[var(--review)]/40 bg-[var(--review)]/10 p-3 text-xs leading-5 text-[var(--review)]">
              {notice}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
                Call context
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
            <EngineBadge
              source={live.usingFallback ? "browser-fallback" : "engine"}
              profile={engine.health?.profile}
              latencyMs={result?.meta.latency_ms}
            />
          </div>
        </section>

        <aside className="card panel-glow flex flex-col items-center gap-5 p-6">
          <div className="flex flex-col items-center">
            <RiskRing
              score={result?.authenticity.score ?? 0}
              band={result ? result.authenticity.band : "insufficient"}
              size={168}
            />
            <div className="mt-2 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
                AI voice
              </div>
              <div className="text-xs text-[var(--muted)]">
                {result?.authenticity.label ?? "Waiting for speech"}
              </div>
            </div>
          </div>
          <div className="h-px w-full bg-white/8" />
          <div className="flex flex-col items-center">
            <RiskRing
              score={result?.fraud.score ?? 0}
              band={result ? result.fraud.band : "insufficient"}
              size={168}
            />
            <div className="mt-2 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
                Fraud content
              </div>
              <div className="text-xs text-[var(--muted)]">
                {result?.fraud.label ?? "Waiting for words"}
              </div>
            </div>
          </div>
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
