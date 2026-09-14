"use client";

import { PhoneOff, ShieldAlert } from "lucide-react";
import { clsx } from "@/lib/format";

/**
 * CSS 3D phone — modern device chrome with a call-host threat screen.
 */
export function PhoneMock3D({
  className,
  authScore = 78,
  fraudScore = 91,
  caller = "Unknown number",
  cli = "+91 98••• ••412",
}: {
  className?: string;
  authScore?: number;
  fraudScore?: number;
  caller?: string;
  cli?: string;
}) {
  return (
    <div className={clsx("phone-stage", className)}>
      <div className="phone-glow" aria-hidden />
      <div className="phone-shadow" aria-hidden />
      <div className="phone-orbit">
        <div className="phone-body">
          <div className="phone-bezel">
            <div className="phone-shine" aria-hidden />
            <div className="phone-island" aria-hidden>
              <span className="phone-island-cam" />
            </div>
            <div className="phone-screen">
              <div className="phone-status">
                <span>9:41</span>
                <span className="phone-status-right">
                  <span className="phone-sig" />
                  <span className="phone-bat" />
                </span>
              </div>

              <div className="phone-banner">
                <ShieldAlert size={12} />
                <span>VoxShield · threat on line</span>
              </div>

              <div className="phone-caller">
                <div className="phone-avatar" aria-hidden>
                  <span className="phone-avatar-ring" />
                  <PhoneOff size={20} />
                </div>
                <div className="phone-caller-kicker">Incoming · unverified</div>
                <div className="font-serif phone-caller-name">{caller}</div>
                <div className="phone-caller-cli">{cli}</div>
              </div>

              <div className="phone-scores">
                <div className="phone-score">
                  <div className="phone-score-label">AI voice</div>
                  <div className="phone-score-value phone-score-auth">{authScore}</div>
                  <div className="phone-score-track">
                    <div className="phone-score-fill phone-score-fill-auth" style={{ width: `${authScore}%` }} />
                  </div>
                </div>
                <div className="phone-score">
                  <div className="phone-score-label">Fraud</div>
                  <div className="phone-score-value phone-score-fraud">{fraudScore}</div>
                  <div className="phone-score-track">
                    <div className="phone-score-fill phone-score-fill-fraud" style={{ width: `${fraudScore}%` }} />
                  </div>
                </div>
              </div>

              <p className="phone-hint">Hang up. Call back on a saved number. Never share an OTP.</p>

              <div className="phone-actions">
                <div className="phone-btn phone-btn-decline">Decline</div>
                <div className="phone-btn phone-btn-hold">Hold</div>
              </div>

              <div className="phone-home" aria-hidden />
            </div>
          </div>

          <div className="phone-btn-vol phone-btn-vol-up" aria-hidden />
          <div className="phone-btn-vol phone-btn-vol-down" aria-hidden />
          <div className="phone-btn-power" aria-hidden />

          <div className="phone-side phone-side-l" aria-hidden />
          <div className="phone-side phone-side-r" aria-hidden />
          <div className="phone-side phone-side-t" aria-hidden />
          <div className="phone-side phone-side-b" aria-hidden />
        </div>
      </div>
    </div>
  );
}
