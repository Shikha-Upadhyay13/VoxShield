"use client";

import type { Layers } from "@/lib/types";

const ROWS: Array<{ key: keyof Layers; label: string; hint: string }> = [
  { key: "acoustic", label: "Acoustic", hint: "Spectral artifacts" },
  { key: "prosody", label: "Prosody", hint: "Rhythm and pitch" },
  { key: "neural", label: "Neural", hint: "Optional model" },
  { key: "context", label: "Context", hint: "Call metadata" },
];

export function LayerBars({ layers }: { layers: Layers }) {
  return (
    <div className="space-y-5">
      {ROWS.map((row) => {
        const layer = layers[row.key];
        const pct = layer.score == null ? 0 : Math.round(layer.score * 100);
        const disabled = layer.score == null;
        const color =
          disabled ? "transparent" : pct >= 70 ? "var(--high)" : pct >= 40 ? "var(--review)" : "var(--genuine)";
        return (
          <div key={row.key}>
            <div className="mb-2 flex items-baseline justify-between">
              <div>
                <div className="text-sm text-[var(--text)]">{row.label}</div>
                <div className="text-[11px] text-[var(--faint)]">{row.hint}</div>
              </div>
              <div className="font-mono text-sm tabular text-[var(--muted)]">
                {disabled ? "off" : pct}
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${disabled ? 0 : pct}%`,
                  background: color,
                  boxShadow: disabled ? "none" : `0 0 12px ${color}`,
                  transition: "width 350ms ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
