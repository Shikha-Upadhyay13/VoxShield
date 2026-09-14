"use client";

import { Phone, Shield } from "lucide-react";
import { clsx } from "@/lib/format";

/**
 * CSS 3D phone — no WebGL. Shows a call-host screen with live risk chrome.
 */
export function PhoneMock3D({
  className,
  score = 84,
  caller = "Unknown · +91 ••••• 4412",
}: {
  className?: string;
  score?: number;
  caller?: string;
}) {
  return (
    <div className={clsx("phone-stage relative mx-auto flex justify-center", className)}>
      <div className="phone-glow pointer-events-none absolute inset-0" aria-hidden />
      <div className="phone-orbit">
        <div className="phone-body">
          <div className="phone-bezel">
            <div className="phone-notch" aria-hidden />
            <div className="phone-screen">
              <div className="phone-status">
                <span>9:41</span>
                <span className="inline-flex items-center gap-1 text-[var(--accent)]">
                  <Shield size={10} />
                  VoxShield
                </span>
              </div>

              <div className="mt-6 flex flex-col items-center text-center">
                <div className="phone-avatar">
                  <Phone size={22} className="text-[var(--accent)]" />
                </div>
                <div className="mt-4 text-[10px] uppercase tracking-[0.2em] text-[var(--faint)]">
                  Incoming call
                </div>
                <div className="font-serif mt-2 text-xl leading-tight text-[var(--text)]">
                  {caller}
                </div>
              </div>

              <div className="phone-risk mt-6">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--faint)]">
                      Impersonation risk
                    </div>
                    <div className="font-mono mt-1 text-2xl text-[var(--high)]">{score}</div>
                  </div>
                  <span className="rounded-full bg-[var(--high-dim)] px-2 py-0.5 text-[10px] text-[var(--high)]">
                    High
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="phone-risk-bar h-full rounded-full bg-[var(--high)]"
                    style={{ width: `${score}%` }}
                  />
                </div>
                <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">
                  Synthetic patterns · transfer language. Hold before you approve.
                </p>
              </div>

              <div className="mt-auto grid grid-cols-2 gap-2 pb-2 pt-5">
                <div className="rounded-full bg-[var(--high)]/90 py-2.5 text-center text-[11px] font-medium text-white">
                  Decline
                </div>
                <div className="rounded-full bg-[var(--accent)]/90 py-2.5 text-center text-[11px] font-medium text-[#04201a]">
                  Accept
                </div>
              </div>
            </div>
          </div>
          <div className="phone-side phone-side-l" aria-hidden />
          <div className="phone-side phone-side-r" aria-hidden />
          <div className="phone-side phone-side-t" aria-hidden />
          <div className="phone-side phone-side-b" aria-hidden />
        </div>
      </div>
    </div>
  );
}
