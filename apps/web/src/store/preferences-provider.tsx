"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "dark" | "light";

export interface FeaturePrefs {
  microphone: boolean;
  notifications: boolean;
  liveCaptions: boolean;
  autoCut: boolean;
  threatAlerts: boolean;
}

interface PreferencesContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  features: FeaturePrefs;
  setFeature: (key: keyof FeaturePrefs, value: boolean) => void;
  requestMicrophone: () => Promise<"granted" | "denied" | "unavailable">;
  requestNotifications: () => Promise<"granted" | "denied" | "unsupported">;
  micPermission: PermissionState | "unknown";
  notificationPermission: NotificationPermission | "unsupported";
  refreshPermissions: () => Promise<void>;
}

const STORAGE_KEY = "voxshield.prefs.v1";

const DEFAULT_FEATURES: FeaturePrefs = {
  microphone: true,
  notifications: true,
  liveCaptions: true,
  autoCut: true,
  threatAlerts: true,
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [features, setFeatures] = useState<FeaturePrefs>(DEFAULT_FEATURES);
  const [hydrated, setHydrated] = useState(false);
  const [micPermission, setMicPermission] = useState<PermissionState | "unknown">("unknown");
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");

  const refreshPermissions = useCallback(async () => {
    if (typeof window === "undefined") return;
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission("unsupported");
    }
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
        setMicPermission(status.state);
        status.onchange = () => setMicPermission(status.state);
      }
    } catch {
      setMicPermission("unknown");
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { theme?: ThemeMode; features?: Partial<FeaturePrefs> };
        if (parsed.theme === "light" || parsed.theme === "dark") {
          setThemeState(parsed.theme);
          applyTheme(parsed.theme);
        } else {
          applyTheme("dark");
        }
        if (parsed.features) {
          setFeatures({ ...DEFAULT_FEATURES, ...parsed.features });
        }
      } else {
        applyTheme("dark");
      }
    } catch {
      applyTheme("dark");
    }
    setHydrated(true);
    void refreshPermissions();
  }, [refreshPermissions]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, features }));
    applyTheme(theme);
  }, [theme, features, hydrated]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    applyTheme(next);
  }, []);

  const setFeature = useCallback((key: keyof FeaturePrefs, value: boolean) => {
    setFeatures((prev) => ({ ...prev, [key]: value }));
  }, []);

  const requestMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return "unavailable" as const;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setFeature("microphone", true);
      await refreshPermissions();
      return "granted" as const;
    } catch {
      setFeature("microphone", false);
      await refreshPermissions();
      return "denied" as const;
    }
  }, [refreshPermissions, setFeature]);

  const requestNotifications = useCallback(async () => {
    if (!("Notification" in window)) return "unsupported" as const;
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
    setFeature("notifications", result === "granted");
    setFeature("threatAlerts", result === "granted");
    return result === "granted" ? ("granted" as const) : ("denied" as const);
  }, [setFeature]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      features,
      setFeature,
      requestMicrophone,
      requestNotifications,
      micPermission,
      notificationPermission,
      refreshPermissions,
    }),
    [
      theme,
      setTheme,
      features,
      setFeature,
      requestMicrophone,
      requestNotifications,
      micPermission,
      notificationPermission,
      refreshPermissions,
    ],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
