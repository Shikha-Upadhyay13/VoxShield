import type { Band, Mode, OperationsAction, Source } from "./types";

export function bandLabel(band: Band): string {
  switch (band) {
    case "genuine":
      return "Genuine";
    case "review":
      return "Review";
    case "high":
      return "High risk";
    case "insufficient":
      return "Insufficient audio";
  }
}

export function modeLabel(mode: Mode): string {
  return mode === "protect" ? "Protect" : "Operations";
}

export function sourceLabel(source: Source): string {
  switch (source) {
    case "live":
      return "Live mic";
    case "upload":
      return "Upload";
    case "demo":
      return "Demo signal";
  }
}

export function actionLabel(action: OperationsAction): string {
  switch (action) {
    case "hold":
      return "Hold transaction";
    case "mfa":
      return "Request MFA";
    case "escalate":
      return "Escalate";
    case "allow":
      return "Allow with reason";
  }
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function inr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
