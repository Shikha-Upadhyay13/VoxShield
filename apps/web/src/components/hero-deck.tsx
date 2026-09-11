"use client";

import { RiskRing } from "./risk-ring";

export function HeroDeck() {
  return (
    <div className="panel panel-glow frame relative overflow-hidden p-6 sm:p-8">
      <div className="scanline" />
      <div className="relative mb-5 flex items-center justify-between">
        <div>
          <div className="kicker">Live integrity</div>
          <div className="mt-1 text-sm">Inbound · unknown CLI</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-band-high px-2.5 py-1 text-[11px] band-high">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--high)]" />
          High risk
        </span>
      </div>

      <div className="relative flex justify-center py-2">
        <div
          className="absolute inset-8 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,122,112,0.16), transparent 68%)",
            animation: "ring-breathe 4.5s ease-in-out infinite",
          }}
        />
        <RiskRing score={84} band="high" size={220} />
      </div>

      <div className="relative mt-2 grid grid-cols-3 gap-2">
        {[
          ["Acoustic", 86],
          ["Prosody", 74],
          ["Context", 72],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-[var(--line)] bg-black/25 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--faint)]">{label}</div>
            <div className="mt-1 font-mono text-lg tabular text-[var(--text)]">{value}</div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-[var(--high)]"
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="relative mt-5 text-xs leading-5 text-[var(--muted)]">
        Vocoder-like cutoff · flat pitch · “approve the transfer now”
      </p>
    </div>
  );
}
