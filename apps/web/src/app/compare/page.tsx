"use client";

import { useState } from "react";
import { PageIntro } from "@/components/atmosphere";
import { LayerBars } from "@/components/layer-bars";
import { RiskRing } from "@/components/risk-ring";
import { synthesizeCloneLike, synthesizeHumanLike } from "@/lib/audio";
import { useLiveMonitor } from "@/hooks/use-live-monitor";
import { useSession } from "@/store/session-provider";
import type { AnalysisResult } from "@/lib/types";

export default function ComparePage() {
  const { context, preset, applyResult } = useSession();
  const live = useLiveMonitor();
  const [human, setHuman] = useState<AnalysisResult | null>(null);
  const [clone, setClone] = useState<AnalysisResult | null>(null);
  const [working, setWorking] = useState(false);

  function run() {
    setWorking(true);
    const h = live.analyzeBuffer(synthesizeHumanLike(), context, preset);
    const c = live.analyzeBuffer(synthesizeCloneLike(), { ...context, urgencyLanguage: true }, preset);
    setHuman(h);
    setClone(c);
    applyResult(c, "demo", "Compare · clone-like", 4200);
    setWorking(false);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageIntro
          kicker="A / B bench"
          title="Same sentence. Two throats."
          body="A human-like reference against a vocoder-flat clone. Judges should see the gap without a teammate file yet."
        />
        <button type="button" className="btn-primary mb-6" onClick={run} disabled={working}>
          {working ? "Scoring…" : human ? "Run again" : "Run comparison"}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-6">
          <div className="kicker">Signal A</div>
          <h2 className="font-serif mt-2 text-3xl">Human-like</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Irregular pitch, pauses, breath.</p>
          {human ? (
            <div className="mt-6 flex flex-col items-center">
              <RiskRing score={human.score} band={human.band} />
              <div className="mt-6 w-full">
                <LayerBars layers={human.layers} />
              </div>
            </div>
          ) : (
            <p className="mt-10 text-sm text-[var(--faint)]">Run the comparison to fill this pane.</p>
          )}
        </section>
        <section className="card panel-glow p-6">
          <div className="kicker">Signal B</div>
          <h2 className="font-serif mt-2 text-3xl">Clone-like</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Flat F0, harmonic stack, brick-wall highs.</p>
          {clone ? (
            <div className="mt-6 flex flex-col items-center">
              <RiskRing score={clone.score} band={clone.band} />
              <div className="mt-6 w-full">
                <LayerBars layers={clone.layers} />
              </div>
            </div>
          ) : (
            <p className="mt-10 text-sm text-[var(--faint)]">Run the comparison to fill this pane.</p>
          )}
        </section>
      </div>

      {human && clone ? (
        <div className="card p-6 text-sm text-[var(--muted)]">
          Gap of <span className="font-mono text-[var(--text)]">{clone.score - human.score}</span> points
          on this laptop. Phase 3 must beat this with the teammate’s real vs XTTS clone.
        </div>
      ) : null}
    </div>
  );
}
