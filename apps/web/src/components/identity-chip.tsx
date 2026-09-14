"use client";

import { clsx } from "@/lib/format";
import type { EngineIdentity } from "@/lib/types";

export function IdentityChip({ identity }: { identity?: EngineIdentity | null }) {
  if (!identity?.enrolled) {
    return (
      <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--faint)]">
        No voiceprint
      </span>
    );
  }
  if (identity.match_score == null) {
    return (
      <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)]">
        Voiceprint pending · {identity.method}
      </span>
    );
  }
  const mismatch = Boolean(identity.mismatch);
  return (
    <span
      className={clsx(
        "rounded-full border px-2.5 py-1 text-[11px]",
        mismatch
          ? "border-[var(--high)]/40 bg-[var(--high)]/15 text-[var(--high)]"
          : "border-[var(--accent)]/40 bg-[var(--accent-dim)] text-[var(--accent)]",
      )}
      title={identity.note ?? identity.method}
    >
      {mismatch ? "Mismatch" : "Match"} · {identity.match_score} · {identity.method}
    </span>
  );
}
