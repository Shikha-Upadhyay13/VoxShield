"use client";

import type { Band } from "@/lib/types";
import { bandLabel } from "@/lib/format";

const COLORS: Record<Band, string> = {
  genuine: "#3dd68c",
  review: "#e8b84a",
  high: "#f07167",
  insufficient: "#8b96a8",
};

export function RiskRing({
  score,
  band,
  size = 196,
}: {
  score: number;
  band: Band;
  size?: number;
}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = band === "insufficient" ? 0 : Math.min(100, Math.max(0, score)) / 100;
  const color = COLORS[band];

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(232,237,244,0.06)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 400ms ease, stroke 200ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-mono text-5xl font-medium tabular tracking-tight" style={{ color }}>
            {band === "insufficient" ? "—" : score}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            {bandLabel(band)}
          </div>
        </div>
      </div>
    </div>
  );
}
