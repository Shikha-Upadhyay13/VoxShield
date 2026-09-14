"use client";

import { useState } from "react";
import { PageIntro } from "@/components/atmosphere";
import { extractFeatures } from "@/lib/scoring";
import { downsample, floatToMono, synthesizeHumanLike } from "@/lib/audio";
import { useSession } from "@/store/session-provider";

export default function EnrollPage() {
  const { enrollment, setEnrollment } = useSession();
  const [name, setName] = useState(enrollment?.name ?? "");
  const [relation, setRelation] = useState(enrollment?.relation ?? "Teammate");
  const [note, setNote] = useState<string | null>(null);

  function enrollFromDemo() {
    const buffer = synthesizeHumanLike();
    const { samples, sampleRate } = downsample(floatToMono(buffer), buffer.sampleRate, 16000);
    const features = extractFeatures(samples, sampleRate);
    const next = {
      name: name.trim() || "Teammate",
      relation,
      enrolledAt: new Date().toISOString(),
      features: {
        pitch: Math.round(features.pitchHz),
        pitch_std: Math.round(Math.sqrt(Math.max(0, features.pitchVariance)) * 10) / 10,
        centroid: Math.round(features.centroid),
        flatness: Number(features.flatness.toFixed(4)),
        rolloff: Math.round(features.rolloff),
        highFreqRatio: Number(features.highFreqRatio.toFixed(3)),
      },
    };
    setEnrollment(next);
    setNote("DSP feature card stored locally. Core will compare live windows with method dsp_features_v1 — not ECAPA.");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-xl border border-[var(--review)]/45 bg-[var(--review)]/10 px-4 py-3 text-sm text-[var(--review)]">
        Lightweight voiceprint — <strong>not ECAPA-TDNN</strong>. Pitch / centroid / flatness card only.
        Call and bank adapters show Match / Mismatch when this print is present.
      </div>

      <PageIntro
        kicker="Cross-session check"
        title="Enroll a genuine voice. Keep the vector, lose the tape."
        body="Maps the PS historical-sample requirement without storing audio. Compact DSP feature card compared on analyze / live stream."
      />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="card p-6">
          <label className="block text-xs text-[var(--faint)]">Display name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Shikha"
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]/40"
          />
          <label className="mt-4 block text-xs text-[var(--faint)]">Relation</label>
          <input
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]/40"
          />
          <button type="button" className="btn-primary mt-6" onClick={enrollFromDemo}>
            Enroll from human-like reference
          </button>
          <p className="mt-3 text-xs leading-5 text-[var(--faint)]">
            Does not clone anyone. Enrollment is a compact feature card for mismatch demos.
          </p>
          {note ? <p className="mt-3 text-xs text-[var(--accent)]">{note}</p> : null}
        </section>

        <aside className="card p-6">
          <div className="kicker">Stored print</div>
          {enrollment ? (
            <>
              <div className="font-serif mt-3 text-3xl">{enrollment.name}</div>
              <p className="text-sm text-[var(--muted)]">{enrollment.relation}</p>
              <dl className="mt-6 space-y-2 font-mono text-xs text-[var(--muted)]">
                <div className="flex justify-between"><dt>Pitch Hz</dt><dd>{enrollment.features.pitch}</dd></div>
                <div className="flex justify-between"><dt>Pitch std</dt><dd>{enrollment.features.pitch_std}</dd></div>
                <div className="flex justify-between"><dt>Centroid</dt><dd>{enrollment.features.centroid}</dd></div>
                <div className="flex justify-between"><dt>Flatness</dt><dd>{enrollment.features.flatness}</dd></div>
              </dl>
              <button type="button" className="btn-ghost mt-6 w-full" onClick={() => setEnrollment(null)}>
                Forget print
              </button>
            </>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">No enrollment yet.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
