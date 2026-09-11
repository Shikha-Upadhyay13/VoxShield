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
        centroid: Math.round(features.centroid),
        flatness: Number(features.flatness.toFixed(3)),
      },
    };
    setEnrollment(next);
    setNote("Voiceprint stored as features only. The waveform was discarded.");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageIntro
        kicker="Cross-session check"
        title="Enroll a genuine voice. Keep the vector, lose the tape."
        body="Maps the official historical-sample requirement without storing audio. Use a teammate name now; swap in a real clip in Phase 3."
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
            Does not clone anyone. Enrollment is a compact feature card, not a recording.
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
                <div className="flex justify-between"><dt>Centroid</dt><dd>{enrollment.features.centroid}</dd></div>
                <div className="flex justify-between"><dt>Flatness</dt><dd>{enrollment.features.flatness}</dd></div>
              </dl>
              <button type="button" className="btn-ghost mt-6 w-full" onClick={() => setEnrollment(null)}>
                Forget print
              </button>
            </>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">No genuine print on this device yet.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
