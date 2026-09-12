"use client";

import Link from "next/link";
import { ArrowRight, AudioWaveform, Brain, Globe2, Shield } from "lucide-react";
import { Atmosphere } from "@/components/atmosphere";
import { BrandMark } from "@/components/brand-mark";
import { HeroDeck } from "@/components/hero-deck";
import { ModeSwitch } from "@/components/mode-switch";
import { useSession } from "@/store/session-provider";

const LAYERS = [
  {
    k: "01",
    title: "Acoustic",
    body: "Spectral artifacts, phase residuals, vocoder cutoffs that TTS leaves behind.",
    icon: AudioWaveform,
  },
  {
    k: "02",
    title: "Prosody",
    body: "Pitch contour, pauses, the micro-variation a cloned voice flattens out.",
    icon: Globe2,
  },
  {
    k: "03",
    title: "Neural",
    body: "Optional anti-spoof model. Stays off if the demo laptop cannot load it.",
    icon: Brain,
  },
  {
    k: "04",
    title: "Context",
    body: "Unknown number, first-time caller, urgency language in English and Hindi.",
    icon: Shield,
  },
];

export default function HomePage() {
  const { mode, setMode } = useSession();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Atmosphere />
      <div className="pointer-events-none absolute inset-0 grid-fade" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <Link href="/" className="flex items-center gap-3">
          <BrandMark />
          <span>
            <span className="block text-sm font-medium tracking-tight">VoxShield</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-[var(--faint)]">
              Voice integrity
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="#how" className="hidden text-xs text-[var(--muted)] hover:text-[var(--text)] md:inline">
            How it works
          </Link>
          <Link href="/scenarios" className="hidden text-xs text-[var(--muted)] hover:text-[var(--text)] md:inline">
            Scenarios
          </Link>
          <ModeSwitch mode={mode} onChange={setMode} />
          <Link href="/console" className="btn-ghost hidden !px-3.5 !py-1.5 text-xs sm:inline-flex">
            Open console
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-10 sm:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/3 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              SIH26104 · AICTE Cyber Security
            </div>
            <h1 className="font-serif mt-6 max-w-xl text-5xl leading-[1.05] tracking-tight text-[var(--text)] sm:text-7xl">
              Trusted voices
              <span className="italic text-[var(--accent)]"> can be faked.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-8 text-[var(--muted)] sm:text-lg">
              Not another upload app — call-protection middleware. Embed into Truecaller-class
              diallers: after permission, score the live call for cloning and scam speech, alert
              the user, and later cut the line when the verdict is critical.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/monitor" className="btn-primary">
                Simulate live call
                <ArrowRight size={16} />
              </Link>
              <Link href="/analyze" className="btn-ghost">
                Offline clip (demo only)
              </Link>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-[var(--line)] pt-6">
              {[
                ["Live WS", "In-call stream"],
                ["0 audio", "Stored by default"],
                ["EN + HI", "Fraud lexicon"],
              ].map(([value, label]) => (
                <div key={label}>
                  <div className="font-serif text-2xl">{value}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--faint)]">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <HeroDeck />
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LAYERS.map((layer) => {
            const Icon = layer.icon;
            return (
              <div key={layer.k} className="card group p-6 transition hover:-translate-y-0.5">
                <div className="mb-8 flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-dim)] text-[var(--accent)]">
                    <Icon size={16} />
                  </span>
                  <span className="font-mono text-[11px] text-[var(--faint)]">{layer.k}</span>
                </div>
                <div className="text-base font-medium">{layer.title}</div>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{layer.body}</p>
              </div>
            );
          })}
        </div>

        <div id="how" className="mt-16 scroll-mt-24">
          <div className="kicker">The kill chain</div>
          <h2 className="font-serif mt-2 text-3xl sm:text-4xl">Five steps. We interrupt at four.</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {[
              ["Harvest", "A few seconds from WhatsApp or YouTube."],
              ["Clone", "XTTS, OpenVoice, a paid API."],
              ["Call", "Mobile, VoIP, or a meeting."],
              ["Pressure", "Send money. Don’t tell anyone."],
              ["We score", "Before the transfer clears."],
            ].map(([t, b], i) => (
              <div key={t} className="card p-5">
                <div className="font-mono text-[11px] text-[var(--accent)]">0{i + 1}</div>
                <div className="mt-3 text-sm font-medium">{t}</div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{b}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="card p-7">
            <div className="kicker">Protect</div>
            <h2 className="font-serif mt-3 text-3xl">For the person who trusts the voice.</h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-[var(--muted)]">
              Hang up. Call back on a saved number. Never UPI or OTP under pressure.
              Written so a parent can follow it in thirty seconds.
            </p>
            <Link href="/protect" className="mt-5 inline-flex text-sm text-[var(--accent)]">
              Open playbook
            </Link>
          </div>
          <div className="card p-7">
            <div className="kicker">Operations</div>
            <h2 className="font-serif mt-3 text-3xl">For the analyst who must not miss it.</h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-[var(--muted)]">
              Hold the transfer, request MFA, escalate — with caller metadata and a
              documented API that looks like a platform, not a one-off site.
            </p>
            <Link href="/operations" className="mt-5 inline-flex text-sm text-[var(--accent)]">
              Open console
            </Link>
          </div>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="card overflow-hidden">
            <div className="border-b border-[var(--line)] px-6 py-4">
              <div className="kicker">What changes</div>
              <h2 className="font-serif mt-2 text-2xl">Caller ID was never the speaker.</h2>
            </div>
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-[var(--line)]">
                {[
                  ["Caller ID / STIR", "Proves a number, not a throat"],
                  ["“I know that voice”", "Exactly what clones are built to pass"],
                  ["Manual callback", "Skipped under pressure"],
                  ["VoxShield score", "A number + a verb, while still on the line"],
                ].map(([l, r]) => (
                  <tr key={l}>
                    <td className="px-6 py-3.5 text-[var(--text)]">{l}</td>
                    <td className="px-6 py-3.5 text-[var(--muted)]">{r}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card p-7">
            <div className="kicker">Ask us</div>
            <div className="mt-4 space-y-5">
              {[
                ["Is the audio stored?", "No. Features and a score. That is the default."],
                ["Does it work in Hindi?", "DSP is language-agnostic. Keywords start EN + HI."],
                ["Can anyone clone a voice here?", "No. The cloner stays off-product, team-only."],
              ].map(([q, a]) => (
                <div key={q}>
                  <div className="text-sm">{q}</div>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="mt-16 flex flex-col gap-3 border-t border-[var(--line)] pt-8 text-xs text-[var(--faint)] sm:flex-row sm:justify-between">
          <span>VoxShield · SIH26104 · AICTE Cyber Security Cell</span>
          <span className="flex gap-4">
            <Link href="/guide">How it works</Link>
            <Link href="/console">Console</Link>
            <Link href="/scenarios">Scenarios</Link>
          </span>
        </footer>
      </main>
    </div>
  );
}
