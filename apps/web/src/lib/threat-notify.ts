import type { Verdict } from "@/lib/types";

const THREAT_VERDICTS = new Set<Verdict>(["fraud_human", "critical"]);

export function isThreatVerdict(verdict: Verdict | undefined | null): boolean {
  return Boolean(verdict && THREAT_VERDICTS.has(verdict));
}

export async function ensureNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Fire a local / SW notification for a live threat.
 * Keep the Call Shield tab in the foreground during demos — mic cannot stay alive in SW.
 */
export async function notifyThreat(input: {
  verdict: Verdict;
  fraudScore: number;
  summary?: string;
}): Promise<void> {
  if (!isThreatVerdict(input.verdict)) return;
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title =
    input.verdict === "critical"
      ? "VoxShield — critical threat"
      : "VoxShield — scam speech detected";
  const body =
    input.summary?.slice(0, 140) ||
    `Fraud score ${input.fraudScore}. Stay on this screen — hang up and call back on a saved number.`;

  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (registration?.showNotification) {
    await registration.showNotification(title, {
      body,
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      tag: "voxshield-threat",
      data: { url: "/monitor" },
    });
    return;
  }

  // Fallback when SW is unavailable (still useful while the tab is open).
  // eslint-disable-next-line no-new
  new Notification(title, { body, icon: "/icons/icon.svg", tag: "voxshield-threat" });
}
