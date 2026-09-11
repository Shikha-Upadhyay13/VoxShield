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
      <section className="card overflow-hidden p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
          For families · last check {lastResult ? lastLabel : "none yet"}
        </div>
        <h2 className="font-serif mt-3 max-w-3xl text-3xl leading-tight sm:text-4xl">{copy.headline}</h2>
        <p className="mt-3 text-sm text-[var(--accent)]">{copy.hindi}</p>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">{copy.body}</p>
        {!lastResult ? (
          <div className="mt-6 flex gap-3">
            <Link href="/monitor" className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#06201a]">
              Run a live check
            </Link>
            <Link href="/analyze" className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm">
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
          <div key={step.title} className="card p-5">
            <div className="mb-4 font-mono text-[11px] text-[var(--faint)]">0{i + 1}</div>
            <div className="text-sm font-medium">{step.title}</div>
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
