"use client";

import type { Band } from "@/lib/types";

const COLORS: Record<Band, string> = {
  genuine: "#22c55e",
  review: "#f59e0b",
  high: "#ef4444",
  insufficient: "#64748b",
};

const BAND_LABEL: Record<Band, string> = {
  genuine: "Genuine",
  review: "Caution",
  high: "Suspicious",
  insufficient: "Waiting",
};

export function RiskRing({
  score,
  band,
  size = 196,
  title = "Risk",
}: {
  score: number;
  band: Band;
  size?: number;
  title?: string;
}) {
  const stroke = 12;
  const r = (size - 28) / 2;
  const c = 2 * Math.PI * r;
  const pct = band === "insufficient" ? 0 : Math.min(100, Math.max(0, score)) / 100;
  const color = COLORS[band];
  const ticks = 36;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <div
        className="absolute inset-5 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color}33, transparent 72%)`,
          filter: "blur(10px)",
        }}
      />
      <svg width={size} height={size} className="relative">
        <defs>
          <filter id={`glow-${title.replace(/\s+/g, "-")}-${band}`}>
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
          filter={`url(#glow-${title.replace(/\s+/g, "-")}-${band})`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 500ms ease, stroke 200ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--faint)]">{title}</div>
          <div className="font-serif text-5xl leading-none tracking-tight" style={{ color }}>
            {band === "insufficient" ? "—" : score}
          </div>
          <div
            className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em]"
            style={{ color }}
          >
            {BAND_LABEL[band]}
          </div>
        </div>
      </div>
    </div>
  );
}
