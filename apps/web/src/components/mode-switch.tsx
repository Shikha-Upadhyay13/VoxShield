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
    <div className="inline-flex rounded-full border border-[var(--line)] bg-black/35 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
              ? "bg-[var(--accent)] text-[#05241c] shadow-[0_6px_16px_rgba(124,232,204,0.25)]"
              : "text-[var(--muted)] hover:text-[var(--text)]",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
