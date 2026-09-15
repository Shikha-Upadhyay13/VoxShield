"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AudioLines, Diamond, Radar, Shield } from "lucide-react";
import { clsx } from "@/lib/format";

type CallPhase = "connecting" | "live" | "verifying" | "threat" | "ended";
type ScanBeat = "scanning" | "partial" | "ready";
type CardId = "auth" | "risk" | "rep";

const WAVE = [10, 18, 28, 16, 34, 22, 38, 14, 30, 20, 12, 26, 16];

function formatCallTime(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * CSS 3D call scene — device chrome, live protection UI, and cursor-tracked tilt.
 */
export function PhoneMock3D({
  className,
  caller = "Unknown caller",
  cli = "+91 98XXX XXXXX",
}: {
  className?: string;
  caller?: string;
  cli?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [phase, setPhase] = useState<CallPhase>("connecting");
  const [scan, setScan] = useState<ScanBeat>("scanning");
  const [seconds, setSeconds] = useState(18);
  const [openCard, setOpenCard] = useState<CardId | null>(null);
  const [run, setRun] = useState(0);

  const [cursorReady, setCursorReady] = useState(false);

  const live = phase === "live" || phase === "verifying" || phase === "threat";
  const threat = phase === "threat";
  const verifying = phase === "verifying";

  useEffect(() => {
    setCursorReady(true);
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    const cursor = cursorRef.current;
    if (!body || !cursor) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;

    const mark = cursor.querySelector<HTMLElement>(".phone-cursor-mark");
    const aura = cursor.querySelector<HTMLElement>(".phone-cursor-aura");
    const restX = 10;
    const restY = -22;
    const restZ = 2;
    let hovering = false;
    let releasing = false;
    let targetX = restX;
    let targetY = restY;
    let targetZ = restZ;
    let targetShiftX = 0;
    let targetShiftY = 0;
    let curX = restX;
    let curY = restY;
    let curZ = restZ;
    let shiftX = 0;
    let shiftY = 0;
    let shineX = 42;
    let shineY = 18;
    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;
    let markX = pointerX;
    let markY = pointerY;
    let auraX = pointerX;
    let auraY = pointerY;
    let velX = 0;
    let velY = 0;
    let lastX = pointerX;
    let lastY = pointerY;
    let raf = 0;

    cursor.classList.add("is-on");
    document.documentElement.classList.add("phone-cursor-live");

    const overPhone = (event: PointerEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      return Boolean(hit && body.contains(hit));
    };

    const applyPhone = () => {
      if (!hovering && !releasing) return;
      body.style.setProperty("--tilt-x", `${curX}deg`);
      body.style.setProperty("--tilt-y", `${curY}deg`);
      body.style.setProperty("--tilt-z", `${curZ}deg`);
      body.style.setProperty("--shift-x", `${shiftX}px`);
      body.style.setProperty("--shift-y", `${shiftY}px`);
      body.style.setProperty("--shine-x", `${shineX}%`);
      body.style.setProperty("--shine-y", `${shineY}%`);
    };

    const applyCursor = () => {
      if (mark) {
        mark.style.transform = `translate3d(${markX}px, ${markY}px, 0)`;
      }
      if (aura) {
        const speed = Math.min(Math.hypot(velX, velY), 48);
        aura.style.transform = `translate3d(${auraX}px, ${auraY}px, 0) scale(${1 + speed * 0.004})`;
      }
    };

    const nearRest = () =>
      Math.abs(curX - restX) < 0.2 &&
      Math.abs(curY - restY) < 0.2 &&
      Math.abs(curZ - restZ) < 0.2 &&
      Math.abs(shiftX) < 0.3 &&
      Math.abs(shiftY) < 0.3;

    const clearPhoneTrack = () => {
      releasing = false;
      body.classList.remove("is-tracking");
      body.style.removeProperty("--tilt-x");
      body.style.removeProperty("--tilt-y");
      body.style.removeProperty("--tilt-z");
      body.style.removeProperty("--shift-x");
      body.style.removeProperty("--shift-y");
      body.style.removeProperty("--shine-x");
      body.style.removeProperty("--shine-y");
    };

    const tick = () => {
      const ease = hovering ? 0.12 : 0.08;
      curX += (targetX - curX) * ease;
      curY += (targetY - curY) * ease;
      curZ += (targetZ - curZ) * ease;
      shiftX += (targetShiftX - shiftX) * ease;
      shiftY += (targetShiftY - shiftY) * ease;
      markX += (pointerX - markX) * 0.28;
      markY += (pointerY - markY) * 0.28;
      auraX += (pointerX - auraX) * 0.14;
      auraY += (pointerY - auraY) * 0.14;
      velX += (pointerX - lastX - velX) * 0.2;
      velY += (pointerY - lastY - velY) * 0.2;
      lastX = pointerX;
      lastY = pointerY;
      applyPhone();
      applyCursor();

      if (releasing && nearRest()) clearPhoneTrack();
      raf = requestAnimationFrame(tick);
    };

    const aimPhone = (event: PointerEvent) => {
      const rect = body.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
      const ny = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
      const cx = Math.max(-1.15, Math.min(1.15, nx));
      const cy = Math.max(-1.15, Math.min(1.15, ny));
      targetY = restY + cx * 38;
      targetX = restX + -cy * 24;
      targetZ = restZ + cx * 10 - cy * 4;
      targetShiftX = cx * 16;
      targetShiftY = cy * 12;
      shineX = 42 + cx * 34;
      shineY = 18 + cy * 22;
    };

    const isPlainBackground = (event: PointerEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      if (!hit) return true;
      if (body.contains(hit)) return false;
      return !hit.closest(
        "a, button, input, textarea, select, label, summary, [role='button'], .phone-sat, .phone-sat-card, .adapter-panel, .btn-primary, .btn-ghost",
      );
    };

    const spawnRipple = (x: number, y: number) => {
      for (let i = 0; i < 2; i += 1) {
        const burst = document.createElement("span");
        burst.className = `phone-cursor-burst${i === 1 ? " is-late" : ""}`;
        burst.style.left = `${x}px`;
        burst.style.top = `${y}px`;
        cursor.appendChild(burst);
        burst.addEventListener("animationend", () => burst.remove());
      }
    };

    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      const over = overPhone(event);
      const onButton = Boolean((event.target as Element | null)?.closest?.("button, a"));

      if (over) {
        hovering = true;
        releasing = false;
        body.classList.add("is-tracking");
        cursor.classList.add("is-device");
        cursor.classList.toggle("is-press", onButton);
        aimPhone(event);
      } else if (hovering) {
        hovering = false;
        releasing = true;
        targetX = restX;
        targetY = restY;
        targetZ = restZ;
        targetShiftX = 0;
        targetShiftY = 0;
        shineX = 42;
        shineY = 18;
        cursor.classList.remove("is-press", "is-device");
      } else {
        cursor.classList.remove("is-device");
        cursor.classList.toggle("is-press", onButton);
      }
    };

    const onDown = (event: PointerEvent) => {
      if (!isPlainBackground(event)) return;
      spawnRipple(event.clientX, event.clientY);
    };

    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    return () => {
      hovering = false;
      releasing = false;
      if (raf) cancelAnimationFrame(raf);
      document.documentElement.classList.remove("phone-cursor-live");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [cursorReady]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const connectMs = reduce ? 200 : 1100;
    const connect = window.setTimeout(() => {
      setPhase("live");
      setScan("scanning");
    }, connectMs);
    return () => window.clearTimeout(connect);
  }, [run]);

  useEffect(() => {
    if (phase !== "live") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t1 = window.setTimeout(() => setScan("partial"), reduce ? 200 : 1600);
    const t2 = window.setTimeout(() => setScan("ready"), reduce ? 400 : 3200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [phase]);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [live, run]);

  useEffect(() => {
    if (phase !== "verifying") return;
    const done = window.setTimeout(() => {
      setPhase("threat");
      setOpenCard("auth");
    }, 1700);
    return () => window.clearTimeout(done);
  }, [phase]);

  const verify = useCallback(() => {
    if (phase !== "live" && phase !== "threat") return;
    setOpenCard("auth");
    setPhase("verifying");
  }, [phase]);

  const endCall = useCallback(() => {
    setPhase("ended");
    setOpenCard(null);
  }, []);

  const replay = useCallback(() => {
    setSeconds(18);
    setScan("scanning");
    setOpenCard(null);
    setPhase("connecting");
    setRun((value) => value + 1);
  }, []);

  const linkLabel =
    phase === "connecting"
      ? "Connecting to demo API"
      : phase === "ended"
        ? "Call ended · demo idle"
        : threat
          ? "Core alert · threat on line"
          : verifying
            ? "Challenge in flight"
            : "Live · core online";

  const cards: Array<{
    id: CardId;
    title: string;
    icon: typeof AudioLines;
    status: string;
    tone: "scan" | "ok" | "warn" | "high";
    detail: string;
  }> = [
    {
      id: "auth",
      title: "Voice authenticity",
      icon: AudioLines,
      status: threat
        ? "18 · synthetic"
        : verifying
          ? "Challenge…"
          : scan === "ready"
            ? "64 · weak match"
            : scan === "partial"
              ? "Vocoder traces"
              : "Analyzing",
      tone: threat ? "high" : scan === "ready" ? "warn" : "scan",
      detail: threat
        ? "High-frequency cutoff and flat pitch — cloned voice likely."
        : "Acoustic + prosody layers scoring this speaker live.",
    },
    {
      id: "risk",
      title: "Conversation risk",
      icon: Diamond,
      status: threat
        ? "91 · high"
        : verifying
          ? "Listening…"
          : scan === "ready"
            ? "72 · urgency"
            : "Monitoring",
      tone: threat ? "high" : scan === "ready" ? "warn" : "scan",
      detail: threat
        ? "Urgency language and a money request on an unknown CLI."
        : "Watches for OTP, transfer, and secrecy phrasing.",
    },
    {
      id: "rep",
      title: "Caller reputation",
      icon: Radar,
      status: threat
        ? "Unknown CLI"
        : scan === "ready" || verifying
          ? "Not in contacts"
          : "Checking",
      tone: threat ? "high" : scan === "ready" ? "warn" : "scan",
      detail: threat
        ? "First-time caller. Number does not match a saved contact."
        : "Cross-checks saved contacts and first-time caller flags.",
    },
  ];

  return (
    <>
    <div
      ref={stageRef}
      className={clsx("phone-stage", className)}
      role="region"
      aria-labelledby={labelId}
    >
      <p id={labelId} className="sr-only">
        Interactive VoxShield call preview. Hover the phone to tilt it.
      </p>
      <div className={clsx("phone-link", live && "is-live", threat && "is-alert")}>
        <span className="phone-link-dot" />
        {linkLabel}
      </div>
      <div className="phone-glow" aria-hidden />
      <div className="phone-shadow" aria-hidden />

      <div className="phone-sats">
        {cards.map((card) => {
          const Icon = card.icon;
          const open = openCard === card.id;
          return (
            <div key={card.id} className={clsx("phone-sat", `phone-sat-${card.id}`)}>
              <div className="phone-sat-bob">
                <button
                  type="button"
                  className={clsx("phone-sat-card", `is-${card.tone}`, open && "is-open")}
                  aria-expanded={open}
                  onClick={() => setOpenCard(open ? null : card.id)}
                >
                  <span className="phone-sat-icon">
                    <Icon size={15} />
                  </span>
                  <span className="phone-sat-copy">
                    <span className="phone-sat-title">{card.title}</span>
                    <span className="phone-sat-status">
                      <span className="phone-sat-pip" />
                      {card.status}
                    </span>
                    {open ? <span className="phone-sat-detail">{card.detail}</span> : null}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="phone-scene">
        <div className="phone-orbit">
          <div className="phone-ghost" aria-hidden />
          <span className="phone-spark phone-spark-a" aria-hidden />
          <span className="phone-spark phone-spark-b" aria-hidden />
          <span className="phone-spark phone-spark-c" aria-hidden />

          <div
            ref={bodyRef}
            className={clsx("phone-body", threat && "is-threat", phase === "ended" && "is-ended")}
          >
            <div className="phone-bezel">
              <div className="phone-shine" aria-hidden />
              <div className="phone-island" aria-hidden>
                <span className="phone-island-cam" />
              </div>
              <div className="phone-screen">
                {phase === "connecting" ? (
                  <div className="phone-boot">
                    <Shield size={22} />
                    <div className="phone-boot-kicker">VoxShield</div>
                    <div className="phone-boot-title">Arming protection</div>
                    <div className="phone-boot-bar" />
                  </div>
                ) : phase === "ended" ? (
                  <div className="phone-ended">
                    <div className="phone-ended-kicker">Call ended</div>
                    <div className="font-serif phone-ended-title">Line dropped</div>
                    <p>Replay the inbound demo or open the live call adapter.</p>
                    <button type="button" className="phone-replay" onClick={replay}>
                      Replay scene
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="phone-caller">
                      <div className="phone-caller-kicker">{caller}</div>
                      <div className="phone-caller-cli">{cli}</div>
                      <div className="phone-avatar" aria-hidden>
                        <span className="phone-avatar-ring" />
                        <span className="phone-avatar-q">?</span>
                      </div>
                      <div className={clsx("phone-protect", threat && "is-alert")}>
                        <span className="phone-protect-dot" />
                        {threat
                          ? "Threat on line"
                          : verifying
                            ? "Challenge sent"
                            : "Protection active"}
                      </div>
                    </div>

                    <div className={clsx("phone-wave", threat && "is-threat", verifying && "is-hot")}>
                      {WAVE.map((height, index) => (
                        <span
                          key={index}
                          style={{
                            animationDelay: `${index * 0.07}s`,
                            ["--h" as string]: `${height}px`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="phone-clock">{formatCallTime(seconds)}</div>

                    {threat ? (
                      <p className="phone-hint">Hang up. Call back on a saved number.</p>
                    ) : verifying ? (
                      <p className="phone-hint">Ask them to repeat a passphrase.</p>
                    ) : (
                      <p className="phone-hint">Core is scoring voice, language, and CLI.</p>
                    )}

                    <div className="phone-actions">
                      <button
                        type="button"
                        className="phone-fab phone-fab-verify"
                        onClick={verify}
                        disabled={verifying}
                      >
                        {verifying ? "Wait" : "Verify"}
                      </button>
                      <button type="button" className="phone-fab phone-fab-end" onClick={endCall}>
                        End
                      </button>
                    </div>
                  </>
                )}
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
    </div>
      {cursorReady
        ? createPortal(
            <div ref={cursorRef} className="phone-cursor is-on" aria-hidden>
              <span className="phone-cursor-aura" />
              <span className="phone-cursor-mark">
                <svg className="phone-cursor-poly" viewBox="0 0 72 84" aria-hidden>
                  <defs>
                    <filter id="vox-cursor-glow" x="-40%" y="-40%" width="180%" height="180%">
                      <feGaussianBlur stdDeviation="1.4" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <linearGradient id="vox-cursor-fill-a" x1="12" y1="4" x2="58" y2="70" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#5eead4" />
                      <stop offset="1" stopColor="#0f766e" />
                    </linearGradient>
                    <linearGradient id="vox-cursor-fill-b" x1="8" y1="8" x2="40" y2="48" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#99f6e4" />
                      <stop offset="1" stopColor="#134e4a" />
                    </linearGradient>
                  </defs>
                  <g filter="url(#vox-cursor-glow)">
                    <polygon points="8,6 34,24 24,34" fill="#5eead4" />
                    <polygon points="8,6 24,34 18,52" fill="#2dd4bf" />
                    <polygon points="24,34 34,24 48,30" fill="#14b8a6" />
                    <polygon points="24,34 48,30 38,46" fill="#0f766e" />
                    <polygon points="18,52 24,34 38,46" fill="#115e59" />
                    <polygon points="18,52 38,46 28,72" fill="#134e4a" />
                    <polygon points="34,24 58,22 48,30" fill="#2dd4bf" />
                    <polygon points="48,30 58,22 62,40" fill="#0d9488" />
                    <polygon points="38,46 48,30 62,40" fill="#115e59" />
                    <polygon points="38,46 62,40 44,62" fill="#042f2e" />
                    <polygon points="28,72 38,46 44,62" fill="#0f766e" />
                    <g stroke="#a7f3d0" strokeWidth="0.85" fill="none" opacity="0.9">
                      <polygon points="8,6 58,22 28,72" />
                      <line x1="8" y1="6" x2="38" y2="46" />
                      <line x1="34" y1="24" x2="18" y2="52" />
                      <line x1="24" y1="34" x2="62" y2="40" />
                      <line x1="48" y1="30" x2="28" y2="72" />
                    </g>
                    <g fill="#ecfeff">
                      <circle cx="8" cy="6" r="2.1" />
                      <circle cx="34" cy="24" r="1.5" />
                      <circle cx="58" cy="22" r="1.7" />
                      <circle cx="24" cy="34" r="1.4" />
                      <circle cx="48" cy="30" r="1.3" />
                      <circle cx="38" cy="46" r="1.5" />
                      <circle cx="62" cy="40" r="1.4" />
                      <circle cx="18" cy="52" r="1.2" />
                      <circle cx="28" cy="72" r="1.8" />
                      <circle cx="44" cy="62" r="1.2" />
                    </g>
                  </g>
                </svg>
              </span>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
