"use client";

import Link from "next/link";
import { Phone, ShieldCheck } from "lucide-react";
import { TRUSTED_CONTACTS } from "@/lib/demo-data";
import { protectCopy } from "@/lib/scoring";
import { useSession } from "@/store/session-provider";

const STEPS = [
  {
    title: "Hang up",
    body: "End the call. A real relative will understand a callback. A clone will try to keep you on the line.",
  },
  {
    title: "Call back on a number you saved",
    body: "Use the contact already in your phone — not the number that just rang, and not a number they dictate.",
  },
  {
    title: "Never UPI or OTP under pressure",
    body: "Banks and family do not ask you to transfer while you are scared. If they do, it is the scam.",
  },
  {
    title: "Report it",
    body: "Cybercrime portal (cybercrime.gov.in) and your bank if money already moved. Tell the next person they may call.",
  },
];

export default function ProtectPage() {
  const { lastResult, lastLabel } = useSession();
  const band = lastResult?.band ?? "genuine";
  const copy = protectCopy(lastResult ? band : "genuine");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="card panel-glow relative overflow-hidden p-7 sm:p-10">
        <div
          className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,232,204,0.16), transparent 70%)" }}
        />
        <div className="kicker">
          For families · last check {lastResult ? lastLabel : "none yet"}
        </div>
        <h2 className="font-serif mt-4 max-w-3xl text-4xl leading-[1.15] sm:text-5xl">{copy.headline}</h2>
        <p className="mt-3 text-sm text-[var(--accent)]">{copy.hindi}</p>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">{copy.body}</p>
        {!lastResult ? (
          <div className="mt-6 flex gap-3">
            <Link href="/monitor" className="btn-primary">
              Run a live check
            </Link>
            <Link href="/analyze" className="btn-ghost">
              Upload a clip
            </Link>
          </div>
        ) : (
          <div className="mt-6 font-mono text-sm text-[var(--muted)]">
            Score {lastResult.score} · {band}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {STEPS.map((step, i) => (
          <div key={step.title} className="card p-6">
            <div className="mb-5 font-mono text-xs text-[var(--accent)]">0{i + 1}</div>
            <div className="font-serif text-2xl">{step.title}</div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="card p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium">
          <ShieldCheck size={16} className="text-[var(--accent)]" />
          Trusted contacts — call these, not the inbound number
        </div>
        <div className="divide-y divide-[var(--line)]">
          {TRUSTED_CONTACTS.map((c) => (
            <div key={c.number} className="flex items-center justify-between gap-4 py-3">
              <div>
                <div className="text-sm">{c.name}</div>
                <div className="text-xs text-[var(--faint)]">{c.relation}</div>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
                <Phone size={12} />
                {c.number}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
