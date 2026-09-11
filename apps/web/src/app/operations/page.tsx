"use client";

import { useState } from "react";
import { SAMPLE_CALLER } from "@/lib/demo-data";
import { actionLabel, clsx, formatDuration, inr } from "@/lib/format";
import { THRESHOLDS } from "@/lib/types";
import type { OperationsAction } from "@/lib/types";
import { AlertBanner } from "@/components/alert-banner";
import { LayerBars } from "@/components/layer-bars";
import { RiskRing } from "@/components/risk-ring";
import { useSession } from "@/store/session-provider";

const ACTIONS: OperationsAction[] = ["hold", "mfa", "escalate", "allow"];

export default function OperationsPage() {
  const { lastResult, lastLabel, preset, setPreset, recordAction, incidents } = useSession();
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const result = lastResult;
  const latestAction = incidents[0]?.action;

  function act(action: OperationsAction) {
    if (action === "allow" && reason.trim().length < 4) {
      setNotice("Allow requires a written reason.");
      return;
    }
    recordAction(action, reason.trim() || undefined);
    setNotice(`${actionLabel(action)} recorded. Feature-only incident updated.`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {result ? <AlertBanner band={result.band} /> : null}

      <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">Active call</div>
          <div className="mt-1 text-lg font-medium">{SAMPLE_CALLER.kycName}</div>
          <div className="mt-1 font-mono text-xs text-[var(--muted)]">
            CLI {SAMPLE_CALLER.cli} · {lastLabel}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-band-high px-3 py-1 text-xs band-high">CLI does not match KYC</span>
          <span className="text-[var(--muted)]">{inr(SAMPLE_CALLER.amountInr)}</span>
          <span className="text-[var(--faint)]">{SAMPLE_CALLER.transactionType}</span>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="card flex flex-col items-center p-6">
          {result ? (
            <RiskRing score={result.score} band={result.band} />
          ) : (
            <p className="py-16 text-sm text-[var(--muted)]">Run a live check or upload to populate risk.</p>
          )}
          <div className="mt-6 w-full">
            <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
              Threshold preset
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["standard", "high_value"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreset(id)}
                  className={clsx(
                    "rounded-xl border px-3 py-3 text-left",
                    preset === id
                      ? "border-[var(--accent)]/40 bg-[var(--accent-dim)]"
                      : "border-[var(--line)]",
                  )}
                >
                  <div className="text-xs font-medium">
                    {id === "standard" ? "Standard inquiry" : "High-value transfer"}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-[var(--faint)]">
                    Review {THRESHOLDS[id].review} · High {THRESHOLDS[id].high}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <div className="mb-4 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
              Policy actions
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => act(action)}
                  className={clsx(
                    "rounded-xl border px-3 py-3 text-left text-sm",
                    latestAction === action
                      ? "border-[var(--accent)]/40 bg-[var(--accent-dim)]"
                      : "border-[var(--line)] hover:bg-[var(--bg-hover)]",
                  )}
                >
                  {actionLabel(action)}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason code (required to Allow)"
              className="mt-4 w-full resize-none rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/40"
              rows={2}
            />
            {notice ? <p className="mt-3 text-xs text-[var(--accent)]">{notice}</p> : null}
          </div>

          {result ? (
            <div className="card p-5">
              <LayerBars layers={result.layers} />
            </div>
          ) : null}
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
              Alert preview
            </div>
            <div className="flex gap-2">
              {(["sms", "email"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setChannel(id)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-[11px] uppercase tracking-wide",
                    channel === id ? "bg-[var(--accent-dim)] text-[var(--accent)]" : "text-[var(--muted)]",
                  )}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-[var(--muted)]">
            {channel === "sms"
              ? `VoxShield: Voice risk ${result?.score ?? "—"} (${result?.band ?? "n/a"}) on ${SAMPLE_CALLER.cli}. Do not approve ${inr(SAMPLE_CALLER.amountInr)} until callback + MFA.`
              : `To: fraud-ops@bank.example\nSubject: Hold — possible voice clone on high-value NEFT\n\nScore ${result?.score ?? "—"} / ${result?.band ?? "n/a"}\nCLI ${SAMPLE_CALLER.cli} does not match enrolled contact.\nDuration ${result ? formatDuration(result.windowMs) : "—"}\nRetention: features only`}
          </pre>
        </div>

        <div className="card p-5">
          <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
            Integration · POST /analyze
          </div>
          <pre className="overflow-x-auto font-mono text-[11px] leading-6 text-[var(--muted)]">
{`curl -X POST http://127.0.0.1:8000/analyze \\
  -H "Authorization: Bearer vx_demo_4f8c" \\
  -F "file=@call.wav" \\
  -F "context=high_value"`}
          </pre>
          <p className="mt-3 text-xs text-[var(--faint)]">
            Same score object the console uses. Core banking is not connected in this prototype —
            the contract is.
          </p>
        </div>
      </section>
    </div>
  );
}
