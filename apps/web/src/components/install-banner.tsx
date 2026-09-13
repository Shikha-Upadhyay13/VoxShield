"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Soft install banner for the call-adapter demo PWA.
 * iOS: add to Home Screen from Share — notifications work best after install.
 */
export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const alone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Boolean((navigator as any).standalone);
    setIsIos(ios);
    setStandalone(alone);
    if (alone) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone || dismissed) return null;
  if (!deferred && !isIos) return null;

  return (
    <div className="animate-in fade-in slide-in-from-top-2 rounded-xl border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-4 py-3 text-sm text-[var(--text)]">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Install call adapter demo</div>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {isIos
              ? "Share → Add to Home Screen. Keep the adapter open during the call — notifications work best after install."
              : "Add to your home screen for a full-screen call adapter and threat alerts."}
          </p>
          {deferred ? (
            <button
              type="button"
              className="btn-primary mt-3 !py-1.5 !text-xs"
              onClick={() => {
                void deferred.prompt().then(() => setDismissed(true));
              }}
            >
              Install app
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="text-[var(--faint)] hover:text-[var(--muted)]"
          onClick={() => setDismissed(true)}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
