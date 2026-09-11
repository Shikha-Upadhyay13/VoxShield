"use client";

import { clsx } from "@/lib/format";
import type { Mode } from "@/lib/types";

export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[var(--line)] bg-black/30 p-1">
      {(
        [
          ["protect", "Protect"],
          ["operations", "Operations"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={clsx(
            "rounded-full px-3.5 py-1.5 text-xs tracking-wide transition",
            mode === id
              ? "bg-[var(--accent-dim)] text-[var(--accent)]"
              : "text-[var(--muted)] hover:text-[var(--text)]",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
