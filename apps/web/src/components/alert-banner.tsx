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
        "flex flex-col gap-1 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        band === "high" ? "border-[rgba(240,113,103,0.35)] bg-band-high" : "border-[rgba(232,184,74,0.35)] bg-band-review",
      )}
    >
      <div>
        <div className="text-sm font-medium">{copy.headline}</div>
        <div className="text-xs text-[var(--muted)]">{copy.body}</div>
      </div>
      <div className={`text-xs font-medium ${band === "high" ? "band-high" : "band-review"}`}>
        Act before money moves
      </div>
    </div>
  );
}
