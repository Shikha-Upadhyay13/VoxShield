import Link from "next/link";
import { PageIntro } from "@/components/atmosphere";

const STEPS = [
  {
    title: "Fill demo/audio/",
    body: "Add short clips under real/, clone/, and replay/ as described in demo/audio/README.md. Without these, Stage 1 authenticity stays uncalibrated.",
  },
  {
    title: "Run calibrate.py",
    body: "From apps/api: python calibrate.py --write. This sets review/high cutoffs from your clips and verifies neural label polarity.",
  },
  {
    title: "Check /health",
    body: "calibrated must be true before you quote authenticity accuracy. Fraud scoring (SilverGuard + lexicon) still works without calibration.",
  },
  {
    title: "Keep the engine warm",
    body: "On Render free tier, ping GET /health every ~10 minutes (UptimeRobot or Vercel cron → /api/keep-alive) so the first judge call is not a cold start.",
  },
];

export default function CalibratePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageIntro
        kicker="Accuracy"
        title="Calibrate before you claim numbers."
        body="Zero-shot authenticity on 2026 cloners is hard. This checklist is how VoxShield becomes honest for SIH — not a fake scoreboard."
      />

      <section className="space-y-4">
        {STEPS.map((step, index) => (
          <div key={step.title} className="card p-6">
            <div className="font-mono text-xs text-[var(--accent)]">0{index + 1}</div>
            <h2 className="font-serif mt-3 text-2xl">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{step.body}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/monitor" className="btn-primary">
          Back to call adapter
        </Link>
        <Link href="/guide" className="btn-ghost">
          How scoring works
        </Link>
      </div>
    </div>
  );
}
