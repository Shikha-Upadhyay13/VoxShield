"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Building2, ShieldAlert, Upload } from "lucide-react";
import { PageIntro } from "@/components/atmosphere";
import { EvidenceBrief } from "@/components/evidence-brief";
import { IdentityChip } from "@/components/identity-chip";
import { RiskRing } from "@/components/risk-ring";
import { clsx } from "@/lib/format";
import { integrityHash, integrityHashSyncFallback } from "@/lib/integrity";
import { analyze, isOk, scoreText } from "@/sdk";
import { useSession } from "@/store/session-provider";
import type { EngineOk, OperationsAction, Verdict } from "@/lib/types";

const SCENARIO = {
  title: "CFO asks for an urgent wire",
  amount: "₹12,40,000",
  beneficiary: "Nova Vendor LLP · HDFC ****4412",
  sampleTranscript:
    "This is Rohan, the CFO. I need you to transfer twelve lakh forty thousand to the vendor right now. Do not call anyone. Send me the OTP from the bank SMS.",
};

type PolicyEvent = { t: string; step: string };

const HOST_ACTIONS: { id: OperationsAction | "callback" | "block"; label: string; hint: string }[] = [
  { id: "hold", label: "Hold transfer", hint: "Freeze NEFT until callback" },
  { id: "mfa", label: "Request MFA", hint: "Step-up auth on known channel" },
  { id: "callback", label: "Callback KYC number", hint: "Out-of-band verify" },
  { id: "block", label: "Block transfer", hint: "Reject this payout locally" },
];

function shouldAutoHold(result: EngineOk): boolean {
  return (
    result.verdict === "critical" ||
    result.verdict === "fraud_human" ||
    result.fraud.band === "high"
  );
}

function hostActionFor(verdict: Verdict): string {
  switch (verdict) {
    case "critical":
    case "fraud_human":
      return "Hold + MFA recommended";
    case "review":
      return "Secondary check recommended";
    case "synthetic_benign":
      return "Flag synthetic voice; payout policy optional";
    default:
      return "Continue under normal controls";
  }
}

export default function BankAdapterPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { enrollment } = useSession();
  const [transcript, setTranscript] = useState(SCENARIO.sampleTranscript);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EngineOk | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [hostNotice, setHostNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [awaitingMfa, setAwaitingMfa] = useState(false);
  const [policyLog, setPolicyLog] = useState<PolicyEvent[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [auditSeal, setAuditSeal] = useState<string | null>(null);

  function pushLog(step: string) {
    setPolicyLog((prev) => [...prev, { t: new Date().toLocaleTimeString(), step }]);
  }

  async function seal(result: EngineOk, action: string) {
    const payload = {
      verdict: result.verdict,
      auth: result.authenticity.score,
      fraud: result.fraud.score,
      action,
      ts: new Date().toISOString(),
    };
    try {
      setAuditSeal(await integrityHash(payload));
    } catch {
      setAuditSeal(integrityHashSyncFallback(payload));
    }
  }

  function applyAutoPolicy(scored: EngineOk) {
    setPolicyLog([]);
    pushLog(`score auth=${scored.authenticity.score} fraud=${scored.fraud.score} verdict=${scored.verdict}`);
    if (shouldAutoHold(scored)) {
      setBlocked(true);
      setAwaitingMfa(true);
      pushLog("auto_hold");
      pushLog("awaiting_mfa");
      setHostNotice("Host policy: high-value action held automatically. MFA / callback required.");
      void seal(scored, "auto_hold");
    } else {
      setBlocked(false);
      setAwaitingMfa(false);
      pushLog("continue");
      setHostNotice(null);
      void seal(scored, "continue");
    }
  }

  async function runTextScore() {
    setBusy(true);
    setError(null);
    setHostNotice(null);
    try {
      const scored = await scoreText(transcript, {
        preset: "high_value",
        context: {
          unknownNumber: true,
          knownContact: false,
          highValue: true,
          callOrigin: "unknown",
        },
      });
      setResult(scored);
      setRawJson(JSON.stringify(scored, null, 2));
      applyAutoPolicy(scored);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Core unreachable.");
    } finally {
      setBusy(false);
    }
  }

  async function runUpload(file: File) {
    setBusy(true);
    setError(null);
    setHostNotice(null);
    try {
      const scored = await analyze(file, file.name, {
        preset: "high_value",
        wantTranscript: true,
        context: {
          unknownNumber: true,
          knownContact: false,
          highValue: true,
          callOrigin: "unknown",
        },
        enrollmentFeatures: enrollment?.features ?? null,
      });
      setRawJson(JSON.stringify(scored, null, 2));
      if (!isOk(scored)) {
        setResult(null);
        setError(scored.reason || "Insufficient audio.");
        return;
      }
      setResult(scored);
      applyAutoPolicy(scored);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Core unreachable.");
    } finally {
      setBusy(false);
    }
  }

  function applyHost(action: (typeof HOST_ACTIONS)[number]["id"]) {
    if (action === "block" || action === "hold") {
      setBlocked(true);
      setAwaitingMfa(true);
    }
    if (action === "mfa" || action === "callback") {
      setAwaitingMfa(true);
    }
    pushLog(`manual_${action}`);
    setHostNotice(`Host simulated: ${action}. Core did not execute this — the adapter did.`);
    if (result) void seal(result, action);
  }

  function tryOverride() {
    if (overrideReason.trim().length < 8) {
      setHostNotice("Override requires a written reason (min 8 characters).");
      return;
    }
    setBlocked(false);
    setAwaitingMfa(false);
    pushLog("override_allow");
    setHostNotice(`Override allowed with reason: ${overrideReason.trim()}`);
    if (result) void seal(result, "override_allow");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageIntro
        kicker="Demo adapter · not VoxShield Bank"
        title="Mock banking host."
        body="Paste a CFO wire / KYC OTP script or attach audio. Core scores; this host auto-holds on high fraud and requires MFA — policy only."
      />

      <section className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-dim)] text-[var(--accent)]">
            <Building2 size={20} />
          </span>
          <div>
            <div className="text-sm font-medium">{SCENARIO.title}</div>
            <div className="mt-1 font-mono text-xs text-[var(--muted)]">
              {SCENARIO.amount} → {SCENARIO.beneficiary}
            </div>
            <div className="mt-2">
              <IdentityChip identity={result?.identity} />
            </div>
          </div>
        </div>
        <div
          className={clsx(
            "rounded-full border px-3 py-1 text-xs",
            blocked
              ? "border-[var(--high)]/40 bg-[var(--high)]/15 text-[var(--high)]"
              : "border-[var(--line)] text-[var(--muted)]",
          )}
        >
          {blocked ? (awaitingMfa ? "Held · awaiting MFA" : "Transfer held / blocked") : "Transfer pending review"}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="card space-y-4 p-5 sm:p-6">
          <div className="kicker">Input → Core SDK</div>
          <label className="block text-xs text-[var(--faint)]">Live / pasted transcript</label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            className="w-full resize-y rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[var(--accent)]/40"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void runTextScore()}>
              {busy ? "Scoring…" : "Score transcript (POST /score-text)"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} />
              Attach audio (POST /analyze)
            </button>
            <button type="button" className="btn-ghost" disabled={blocked} onClick={() => setHostNotice("Approve disabled while held.")}>
              Approve transfer
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void runUpload(file);
                e.target.value = "";
              }}
            />
          </div>
          {error ? <p className="text-sm text-[var(--high)]">{error}</p> : null}
          {hostNotice ? (
            <p className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-dim)] px-3 py-2 text-xs text-[var(--accent)]">
              {hostNotice}
            </p>
          ) : null}
          {blocked ? (
            <div className="rounded-xl border border-[var(--high)]/35 bg-[var(--high)]/10 p-4">
              <div className="text-sm font-medium text-[var(--high)]">MFA / callback gate</div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Override only with a written reason (mirrors Ops Allow).
              </p>
              <input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason for override…"
                className="mt-3 w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-sm outline-none"
              />
              <button type="button" className="btn-ghost mt-3" onClick={tryOverride}>
                Override hold
              </button>
            </div>
          ) : null}
        </section>

        <aside className="card flex flex-col items-center justify-center gap-6 p-6">
          {result ? (
            <>
              <RiskRing title="Authenticity" score={result.authenticity.score} band={result.authenticity.band} size={150} />
              <RiskRing title="Fraud" score={result.fraud.score} band={result.fraud.band} size={150} />
              <div className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-4 py-3 text-center">
                <div className="kicker">Verdict</div>
                <div className="font-serif mt-1 text-2xl capitalize">{result.verdict.replaceAll("_", " ")}</div>
                <p className="mt-2 text-xs text-[var(--muted)]">{hostActionFor(result.verdict)}</p>
              </div>
            </>
          ) : (
            <p className="py-12 text-center text-sm text-[var(--muted)]">
              Score a transcript or clip to populate Core response.
            </p>
          )}
        </aside>
      </div>

      {result ? <EvidenceBrief result={result} /> : null}

      <section className="card p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert size={16} className="text-[var(--accent)]" />
          <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
            Host actions + policy log
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {HOST_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => applyHost(action.id)}
              className="rounded-xl border border-[var(--line)] px-3 py-3 text-left hover:bg-[var(--bg-hover)]"
            >
              <div className="text-sm font-medium">{action.label}</div>
              <div className="mt-1 text-[11px] text-[var(--faint)]">{action.hint}</div>
            </button>
          ))}
        </div>
        {policyLog.length ? (
          <pre className="mt-4 overflow-x-auto font-mono text-[11px] leading-5 text-[var(--muted)]">
            {policyLog.map((e) => `${e.t} → ${e.step}`).join("\n")}
          </pre>
        ) : null}
        {auditSeal ? (
          <p className="mt-3 break-all font-mono text-[10px] text-[var(--faint)]">
            Audit seal · {auditSeal}
          </p>
        ) : null}
      </section>

      {rawJson ? (
        <section className="card p-5">
          <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
            Raw Core payload
          </div>
          <pre className="max-h-80 overflow-auto font-mono text-[11px] leading-5 text-[var(--muted)]">
            {rawJson}
          </pre>
        </section>
      ) : null}

      <p className="text-xs text-[var(--faint)]">
        Same SDK as the{" "}
        <Link href="/monitor" className="text-[var(--accent)]">
          call adapter
        </Link>
        . Contract: <code className="font-mono">docs/ENGINE.md §7</code>.
      </p>
    </div>
  );
}
