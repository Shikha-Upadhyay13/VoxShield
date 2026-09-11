"use client";

import type { Band } from "@/lib/types";
import { protectCopy } from "@/lib/scoring";
import { clsx } from "@/lib/format";

export function AlertBanner({ band }: { band: Band }) {
  if (band === "genuine" || band === "insufficient") return null;
  const copy = protectCopy(band);
  return (
    <div
      className={clsx(
        "flex flex-col gap-2 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
        band === "high"
          ? "border-[rgba(255,122,112,0.4)] bg-[linear-gradient(90deg,rgba(255,122,112,0.16),transparent)]"
          : "border-[rgba(240,193,90,0.4)] bg-[linear-gradient(90deg,rgba(240,193,90,0.14),transparent)]",
      )}
    >
      <div>
        <div className="text-sm font-medium">{copy.headline}</div>
        <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{copy.body}</div>
      </div>
      <div className={`shrink-0 text-[11px] uppercase tracking-[0.16em] ${band === "high" ? "band-high" : "band-review"}`}>
        Act before money moves
      </div>
    </div>
  );
}
