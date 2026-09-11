"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { SAMPLE_INCIDENTS } from "@/lib/demo-data";
import { reband } from "@/lib/scoring";
import type {
  AnalysisResult,
  ContextFlags,
  Incident,
  LiveSession,
  Mode,
  OperationsAction,
  ScorePoint,
  Source,
  ThresholdPreset,
} from "@/lib/types";

const STORAGE_KEY = "voxshield.session.v1";

interface Persisted {
  mode: Mode;
  preset: ThresholdPreset;
  incidents: Incident[];
  context: ContextFlags;
}

interface SessionContextValue {
  mode: Mode;
  setMode: (mode: Mode) => void;
  preset: ThresholdPreset;
  setPreset: (preset: ThresholdPreset) => void;
  context: ContextFlags;
  setContext: (patch: Partial<ContextFlags>) => void;
  session: LiveSession;
  lastResult: AnalysisResult | null;
  lastLabel: string;
  lastSource: Source | null;
  incidents: Incident[];
  selectedIncidentId: string | null;
  setSelectedIncidentId: (id: string | null) => void;
  startSession: (source: Source, label: string) => void;
  updateLive: (partial: Partial<LiveSession> & { appendPoint?: ScorePoint }) => void;
  applyResult: (result: AnalysisResult, source: Source, label: string, durationMs?: number) => void;
  stopSession: () => void;
  recordAction: (action: OperationsAction, reason?: string) => void;
  clearIncidents: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const idleSession: LiveSession = {
  active: false,
  startedAt: null,
  source: "live",
  label: "",
  result: null,
  timeline: [],
  inputLevel: 0,
  insufficient: false,
};

function loadPersisted(): Partial<Persisted> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : {};
  } catch {
    return {};
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("protect");
  const [preset, setPresetState] = useState<ThresholdPreset>("standard");
  const [context, setContextState] = useState<ContextFlags>({
    unknownNumber: true,
    firstTimeCaller: true,
    urgencyLanguage: false,
  });
  const [session, setSession] = useState<LiveSession>(idleSession);
  const [lastResult, setLastResult] = useState<AnalysisResult | null>(null);
  const [lastLabel, setLastLabel] = useState("No session yet");
  const [lastSource, setLastSource] = useState<Source | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>(SAMPLE_INCIDENTS);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(SAMPLE_INCIDENTS[0]?.id ?? null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persisted = loadPersisted();
    if (persisted.mode) setMode(persisted.mode);
    if (persisted.preset) setPresetState(persisted.preset);
    if (persisted.context) setContextState(persisted.context);
    if (persisted.incidents?.length) {
      setIncidents(persisted.incidents);
      setSelectedIncidentId(persisted.incidents[0]?.id ?? null);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: Persisted = { mode, preset, incidents, context };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [hydrated, mode, preset, incidents, context]);

  const setPreset = useCallback(
    (next: ThresholdPreset) => {
      setPresetState(next);
      setLastResult((prev) => (prev ? reband(prev, next) : prev));
      setSession((prev) =>
        prev.result ? { ...prev, result: reband(prev.result, next) } : prev,
      );
    },
    [],
  );

  const setContext = useCallback((patch: Partial<ContextFlags>) => {
    setContextState((prev) => ({ ...prev, ...patch }));
  }, []);

  const startSession = useCallback((source: Source, label: string) => {
    setSession({
      active: true,
      startedAt: Date.now(),
      source,
      label,
      result: null,
      timeline: [],
      inputLevel: 0,
      insufficient: false,
    });
  }, []);

  const updateLive = useCallback((partial: Partial<LiveSession> & { appendPoint?: ScorePoint }) => {
    const { appendPoint, ...rest } = partial;
    setSession((prev) => ({
      ...prev,
      ...rest,
      timeline: appendPoint ? [...prev.timeline, appendPoint].slice(-40) : (rest.timeline ?? prev.timeline),
    }));
    if (partial.result) {
      setLastResult(partial.result);
      setLastLabel(partial.label ?? prevLabel(partial, lastLabel));
      setLastSource(partial.source ?? lastSource ?? "live");
    }
  }, [lastLabel, lastSource]);

  const applyResult = useCallback(
    (result: AnalysisResult, source: Source, label: string, durationMs = result.windowMs) => {
      const banded = reband(result, preset);
      setLastResult(banded);
      setLastLabel(label);
      setLastSource(source);
      setSession((prev) => ({
        ...prev,
        active: false,
        source,
        label,
        result: banded,
        insufficient: banded.band === "insufficient",
        timeline:
          prev.timeline.length > 0
            ? prev.timeline
            : [{ tMs: durationMs, score: banded.score }],
      }));
      const incident: Incident = {
        id: `inc_${Date.now()}`,
        timestamp: new Date().toISOString(),
        mode,
        durationMs,
        source,
        label,
        result: banded,
      };
      setIncidents((prev) => [incident, ...prev].slice(0, 40));
      setSelectedIncidentId(incident.id);
    },
    [mode, preset],
  );

  const stopSession = useCallback(() => {
    setSession((prev) => {
      if (prev.active && prev.result && prev.result.band !== "insufficient") {
        const incident: Incident = {
          id: `inc_${Date.now()}`,
          timestamp: new Date().toISOString(),
          mode,
          durationMs: prev.startedAt ? Date.now() - prev.startedAt : prev.result.windowMs,
          source: prev.source,
          label: prev.label || "Live session",
          result: prev.result,
        };
        setIncidents((list) => [incident, ...list].slice(0, 40));
        setSelectedIncidentId(incident.id);
      }
      return { ...prev, active: false, inputLevel: 0 };
    });
  }, [mode]);

  const recordAction = useCallback((action: OperationsAction, reason?: string) => {
    setIncidents((prev) => {
      if (!prev.length) return prev;
      const [head, ...rest] = prev;
      if (!head) return prev;
      return [{ ...head, action, actionReason: reason }, ...rest];
    });
  }, []);

  const clearIncidents = useCallback(() => {
    setIncidents([]);
    setSelectedIncidentId(null);
  }, []);

  const value: SessionContextValue = {
    mode,
    setMode,
    preset,
    setPreset,
    context,
    setContext,
    session,
    lastResult,
    lastLabel,
    lastSource,
    incidents,
    selectedIncidentId,
    setSelectedIncidentId,
    startSession,
    updateLive,
    applyResult,
    stopSession,
    recordAction,
    clearIncidents,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function prevLabel(partial: Partial<LiveSession>, fallback: string): string {
  return partial.label || fallback;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
