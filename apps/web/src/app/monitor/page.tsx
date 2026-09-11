"use client";

import { useEffect, useState } from "react";
import { AlertBanner } from "@/components/alert-banner";
import { PageIntro } from "@/components/atmosphere";
import { LayerBars } from "@/components/layer-bars";
import { RiskRing } from "@/components/risk-ring";
import { ScoreTimeline } from "@/components/score-timeline";
import { SpectrogramBars, Waveform } from "@/components/waveform";
import { WhyScore } from "@/components/why-score";
import { clsx } from "@/lib/format";
import { insufficientResult } from "@/lib/scoring";
import { useLiveMonitor } from "@/hooks/use-live-monitor";
import { useSession } from "@/store/session-provider";

export default function MonitorPage() {
  const {
    context,
    setContext,
    preset,
    session,
    startSession,
    updateLive,
    stopSession,
  } = useSession();
  const live = useLiveMonitor();
  const [busy, setBusy] = useState(false);

  const result = session.result ?? insufficientResult();

  useEffect(() => {
    live.updateOptions({
      context,
      preset,
      onLevel: (inputLevel) => updateLive({ inputLevel }),
      onScore: ({ result: next, tMs }) => {
        updateLive({
          result: next,
          insufficient: next.band === "insufficient",
          appendPoint: { tMs, score: next.score },
          label: "Laptop microphone",
          source: "live",
        });
      },
    });
  }, [context, preset, live.updateOptions, updateLive]);

  async function toggle() {
    if (session.active) {
      live.stop();
      stopSession();
      return;
    }
    setBusy(true);
    try {
      startSession("live", "Laptop microphone");
      await live.start({
        context,
        preset,
        onLevel: (inputLevel) => updateLive({ inputLevel }),
        onScore: ({ result: next, tMs }) => {
          updateLive({
            result: next,
            insufficient: next.band === "insufficient",
            appendPoint: { tMs, score: next.score },
            label: "Laptop microphone",
            source: "live",
          });
        },
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
        body="Point a phone playing a clone at the laptop mic — or speak. The score updates while the voice is still in the room."
      />
      <AlertBanner band={result.band} />

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="card frame p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Live stream</div>
              <div className="text-xs text-[var(--faint)]">
                Phone speaker into the laptop mic — or speak directly.
              </div>
            </div>
            <button
              type="button"
              onClick={toggle}
              disabled={busy}
              className={clsx(
                session.active ? "btn-ghost !border-[rgba(255,122,112,0.4)] !text-[var(--high)]" : "btn-primary",
                "!py-2",
              )}
            >
              {session.active ? "Stop session" : busy ? "Requesting mic…" : "Start microphone"}
            </button>
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

          <div className="mt-5">
            <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
              Context flags
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["unknownNumber", "Unknown number"],
                  ["firstTimeCaller", "First-time caller"],
                  ["urgencyLanguage", "Urgency language"],
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

        <aside className="card panel-glow flex flex-col items-center p-6">
          <RiskRing score={result.score} band={result.band} size={220} />
          <div className="mt-6 w-full">
            <LayerBars layers={result.layers} />
          </div>
        </aside>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
            Score over time
          </div>
          <ScoreTimeline points={session.timeline} />
        </div>
        <WhyScore result={result} />
      </div>
    </div>
  );
}
