"use client";

import type { AnalysisResult } from "@/lib/types";

export function WhyScore({ result }: { result: AnalysisResult }) {
  const reasons = [
    ...result.layers.acoustic.reasons,
    ...result.layers.prosody.reasons,
    ...result.layers.context.reasons,
  ].slice(0, 4);

  return (
    <div className="card p-6">
      <div className="kicker mb-4">Why this score</div>
      <ul className="space-y-2.5">
        {reasons.map((reason) => (
          <li key={reason} className="flex gap-3 text-sm leading-relaxed text-[var(--muted)]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
