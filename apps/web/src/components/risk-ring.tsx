"use client";

import type { Band } from "@/lib/types";
import { bandLabel } from "@/lib/format";

const COLORS: Record<Band, string> = {
  genuine: "#3ee09a",
  review: "#f0c15a",
  high: "#ff7a70",
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
  const stroke = 11;
  const r = (size - 28) / 2;
  const c = 2 * Math.PI * r;
  const pct = band === "insufficient" ? 0 : Math.min(100, Math.max(0, score)) / 100;
  const color = COLORS[band];
  const ticks = 36;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <div
        className="absolute inset-6 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color}22, transparent 70%)`,
          filter: "blur(8px)",
        }}
      />
      <svg width={size} height={size} className="relative">
        <defs>
          <filter id={`glow-${band}`}>
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {Array.from({ length: ticks }).map((_, i) => {
          const a = (i / ticks) * Math.PI * 2 - Math.PI / 2;
          const inner = size / 2 - 8;
          const outer = size / 2 - 2;
          return (
            <line
              key={i}
              x1={size / 2 + Math.cos(a) * inner}
              y1={size / 2 + Math.sin(a) * inner}
              x2={size / 2 + Math.cos(a) * outer}
              y2={size / 2 + Math.sin(a) * outer}
              stroke="rgba(238,243,248,0.14)"
              strokeWidth={i % 9 === 0 ? 1.6 : 0.8}
            />
          );
        })}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(232,237,244,0.08)"
          strokeWidth={stroke}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
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
          filter={`url(#glow-${band})`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 500ms ease, stroke 200ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--faint)]">Risk</div>
          <div className="font-serif text-6xl leading-none tracking-tight" style={{ color }}>
            {band === "insufficient" ? "—" : score}
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
            {bandLabel(band)}
          </div>
        </div>
      </div>
    </div>
  );
}
