"use client";

import type { ScorePoint } from "@/lib/types";

export function ScoreTimeline({ points }: { points: ScorePoint[] }) {
  const w = 640;
  const h = 88;
  const pad = 8;
  const data = points.length ? points : [{ tMs: 0, score: 0 }];
  const maxT = Math.max(1000, data[data.length - 1]?.tMs ?? 1000);
  const path = data
    .map((p, i) => {
      const x = pad + (p.tMs / maxT) * (w - pad * 2);
      const y = h - pad - (p.score / 100) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full">
      <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="rgba(232,237,244,0.08)" />
      <line
        x1={pad}
        x2={w - pad}
        y1={h - pad - 0.4 * (h - pad * 2)}
        y2={h - pad - 0.4 * (h - pad * 2)}
        stroke="rgba(232,184,74,0.18)"
        strokeDasharray="3 5"
      />
      <line
        x1={pad}
        x2={w - pad}
        y1={h - pad - 0.7 * (h - pad * 2)}
        y2={h - pad - 0.7 * (h - pad * 2)}
        stroke="rgba(240,113,103,0.18)"
        strokeDasharray="3 5"
      />
      <path d={path} fill="none" stroke="#7ee0c7" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
