"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageIntro } from "@/components/atmosphere";
import { bandLabel, clsx, formatClock } from "@/lib/format";
import { useSession } from "@/store/session-provider";

const QUICK = [
  { href: "/monitor", title: "Live check", body: "Laptop mic · phone clone demo" },
  { href: "/analyze", title: "Upload clip", body: "Judge safety net" },
  { href: "/compare", title: "Side by side", body: "Human-like vs clone-like" },
  { href: "/scenarios", title: "Load a story", body: "Personal, CFO, official" },
];

export default function ConsolePage() {
  const { incidents, lastResult, enrollment, mode } = useSession();
  const high = incidents.filter((i) => i.result.band === "high").length;
  const held = incidents.filter((i) => i.action === "hold" || i.action === "escalate").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageIntro
        kicker="Command center"
        title="One engine. Two faces."
        body="Start a check, load a scenario, or review what already crossed the line. This is the desk a judge should land on."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Last score", lastResult ? String(lastResult.score) : "—", lastResult ? bandLabel(lastResult.band) : "No session"],
          ["Incidents", String(incidents.length), "Feature-only log"],
          ["High risk", String(high), "Needs a verb"],
          ["Holds / escalations", String(held), "Operations actions"],
        ].map(([k, v, s]) => (
          <div key={k} className="card p-5">
            <div className="kicker">{k}</div>
            <div className="font-serif mt-2 text-4xl">{v}</div>
            <div className="mt-1 text-xs text-[var(--faint)]">{s}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="kicker">Recent incidents</div>
            <Link href="/incidents" className="text-xs text-[var(--accent)]">
              Open ledger
            </Link>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {incidents.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-sm">{item.label}</div>
                  <div className="text-[11px] text-[var(--faint)]">{formatClock(item.timestamp)}</div>
                </div>
                <span className={clsx("font-mono text-sm", `band-${item.result.band}`)}>
                  {item.result.score}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-6">
          <div className="kicker">System</div>
          <ul className="mt-4 space-y-3 text-sm text-[var(--muted)]">
            <li className="flex justify-between"><span>Acoustic DSP</span><span className="band-genuine">live</span></li>
            <li className="flex justify-between"><span>Prosody</span><span className="band-genuine">live</span></li>
            <li className="flex justify-between"><span>Neural anti-spoof</span><span className="text-[var(--faint)]">unloaded</span></li>
            <li className="flex justify-between"><span>Mode</span><span>{mode}</span></li>
            <li className="flex justify-between">
              <span>Voiceprint</span>
              <span>{enrollment ? enrollment.name : "not enrolled"}</span>
            </li>
            <li className="flex justify-between"><span>Retention</span><span>features only</span></li>
          </ul>
          <Link href="/enroll" className="btn-ghost mt-6 w-full">
            {enrollment ? "Review voiceprint" : "Enroll a genuine voice"}
          </Link>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK.map((q) => (
          <Link key={q.href} href={q.href} className="card group p-5 transition hover:-translate-y-0.5">
            <div className="text-sm font-medium">{q.title}</div>
            <p className="mt-1 text-xs text-[var(--faint)]">{q.body}</p>
            <div className="mt-4 text-[var(--accent)]">
              <ArrowRight size={16} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
