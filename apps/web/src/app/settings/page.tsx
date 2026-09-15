"use client";

import { useState } from "react";
import { Bell, Mic, Moon, ShieldAlert, Subtitles, Sun } from "lucide-react";
import { PageIntro } from "@/components/atmosphere";
import { clsx } from "@/lib/format";
import { usePreferences, type FeaturePrefs, type ThemeMode } from "@/store/preferences-provider";

function Toggle({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={clsx(
        "relative h-7 w-12 shrink-0 rounded-full border transition",
        on ? "border-[var(--accent)]/40 bg-[var(--accent)]" : "border-[var(--line)] bg-[var(--surface-muted)]",
        disabled && "opacity-40",
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
          on ? "left-6" : "left-0.5",
        )}
      />
    </button>
  );
}

const FEATURE_ROWS: {
  key: keyof FeaturePrefs;
  title: string;
  body: string;
  icon: typeof Mic;
}[] = [
  {
    key: "microphone",
    title: "Microphone",
    body: "Needed for the call adapter live stream into Core.",
    icon: Mic,
  },
  {
    key: "notifications",
    title: "Browser notifications",
    body: "Allow OS alerts when a high-risk verdict appears.",
    icon: Bell,
  },
  {
    key: "liveCaptions",
    title: "Live captions",
    body: "Browser speech-to-text for fraud scoring when Whisper is unavailable.",
    icon: Subtitles,
  },
  {
    key: "autoCut",
    title: "Auto-cut on critical",
    body: "Call adapter simulates hanging up on critical verdicts (host policy).",
    icon: ShieldAlert,
  },
  {
    key: "threatAlerts",
    title: "Threat alert banners",
    body: "In-app and notification alerts for fraud_human / critical.",
    icon: Bell,
  },
];

export default function SettingsPage() {
  const {
    theme,
    setTheme,
    features,
    setFeature,
    requestMicrophone,
    requestNotifications,
    micPermission,
    notificationPermission,
    refreshPermissions,
  } = usePreferences();
  const [notice, setNotice] = useState<string | null>(null);

  async function onTheme(next: ThemeMode) {
    setTheme(next);
    setNotice(next === "light" ? "Light mode on." : "Dark mode on.");
  }

  async function enableMic() {
    const result = await requestMicrophone();
    setNotice(
      result === "granted"
        ? "Microphone allowed."
        : result === "denied"
          ? "Microphone blocked — allow it in the browser site settings."
          : "Microphone API unavailable in this browser.",
    );
  }

  async function enableNotifications() {
    const result = await requestNotifications();
    setNotice(
      result === "granted"
        ? "Notifications allowed."
        : result === "unsupported"
          ? "Notifications are not supported here."
          : "Notifications blocked — allow them in the browser site settings.",
    );
  }

  return (
    <div className="w-full space-y-8">
      <PageIntro
        className="max-w-none"
        kicker="Settings"
        title="Appearance and permissions."
        body="Switch dark/light theme and turn demo features on only after the browser grants access."
      />

      {notice ? (
        <p className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-dim)] px-4 py-3 text-sm text-[var(--accent)]">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <section className="flex h-full flex-col rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-6 sm:p-8">
        <div className="kicker">Appearance</div>
        <h2 className="mt-2 text-lg font-medium tracking-tight">Theme</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Applies across the whole app.</p>
        <div className="mt-6 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              { id: "dark" as const, label: "Dark", icon: Moon },
              { id: "light" as const, label: "Light", icon: Sun },
            ] as const
          ).map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => void onTheme(opt.id)}
                className={clsx(
                  "flex min-h-[7.5rem] w-full items-center gap-4 rounded-xl border px-5 py-5 text-left transition",
                  active
                    ? "border-[var(--accent)]/45 bg-[var(--accent-dim)]"
                    : "border-[var(--line)] hover:bg-[var(--bg-hover)]",
                )}
              >
                <Icon size={22} className={active ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
                <span>
                  <span className="block text-base font-medium">{opt.label}</span>
                  <span className="text-xs text-[var(--faint)]">
                    {opt.id === "dark" ? "Default for demos" : "Brighter room / projector"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex h-full flex-col rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-6 sm:p-8">
        <div className="kicker">Permissions</div>
        <h2 className="mt-2 text-lg font-medium tracking-tight">Browser access</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Mic · {micPermission} · Notifications · {notificationPermission}
        </p>
        <div className="mt-6 flex flex-1 flex-wrap content-start gap-3">
          <button type="button" className="btn-primary !px-5 !py-3 !text-sm" onClick={() => void enableMic()}>
            Allow microphone
          </button>
          <button type="button" className="btn-ghost !px-5 !py-3 !text-sm" onClick={() => void enableNotifications()}>
            Allow notifications
          </button>
          <button type="button" className="btn-ghost !px-5 !py-3 !text-sm" onClick={() => void refreshPermissions()}>
            Refresh status
          </button>
        </div>
      </section>
      </div>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-6 sm:p-8">
        <div className="kicker">Features</div>
        <h2 className="mt-2 text-lg font-medium tracking-tight">Turn features on or off</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Preferences are stored on this device only.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {FEATURE_ROWS.map((row) => {
            const Icon = row.icon;
            const on = features[row.key];
            return (
              <div
                key={row.key}
                className="flex min-h-[6.5rem] items-start gap-4 rounded-xl border border-[var(--line)] bg-[var(--bg)]/40 px-4 py-4"
              >
                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-dim)] text-[var(--accent)]">
                  <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{row.title}</div>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{row.body}</p>
                </div>
                <Toggle
                  label={row.title}
                  on={on}
                  onChange={(next) => {
                    setFeature(row.key, next);
                    if (row.key === "microphone" && next) void enableMic();
                    if ((row.key === "notifications" || row.key === "threatAlerts") && next) {
                      void enableNotifications();
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
