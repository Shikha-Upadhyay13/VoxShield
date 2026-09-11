"use client";

import { useRouter } from "next/navigation";
import { PageIntro } from "@/components/atmosphere";
import { SCENARIOS } from "@/lib/demo-data";
import { clsx, inr } from "@/lib/format";
import { useSession } from "@/store/session-provider";

export default function ScenariosPage() {
  const router = useRouter();
  const { loadScenario, scenarioId } = useSession();

  return (
    <div className="mx-auto max-w-6xl">
      <PageIntro
        kicker="Attack library"
        title="Show the crime, then the catch."
        body="Three stories judges already know. Load one and the console switches mode, context, and a scored incident."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        {SCENARIOS.map((s) => (
          <article key={s.id} className={clsx("card flex flex-col p-6", scenarioId === s.id && "panel-glow")}>
            <div className="kicker">{s.mode === "protect" ? "Family" : "Institution"}</div>
            <h2 className="font-serif mt-3 text-2xl">{s.title}</h2>
            <p className="mt-1 text-xs text-[var(--faint)]">{s.victim}</p>
            <blockquote className="mt-5 rounded-2xl bg-black/25 px-4 py-3 text-sm italic leading-6 text-[var(--muted)]">
              “{s.line}”
            </blockquote>
            <div className="mt-4 flex justify-between text-xs text-[var(--faint)]">
              <span>{s.caller.transactionType}</span>
              <span>{s.caller.amountInr ? inr(s.caller.amountInr) : "No transfer"}</span>
            </div>
            <div className="mt-2 font-mono text-sm">
              Seed score <span className={`band-${s.result.band}`}>{s.result.score}</span>
            </div>
            <button
              type="button"
              className="btn-primary mt-6"
              onClick={() => router.push(loadScenario(s.id))}
            >
              Load this story
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
