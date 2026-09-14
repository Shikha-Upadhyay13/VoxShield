"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { SAMPLE_INCIDENTS, SCENARIOS } from "@/lib/demo-data";
import { integrityHash, integrityHashSyncFallback } from "@/lib/integrity";
import { reband } from "@/lib/scoring";
import type {
  AnalysisResult,
  CallerContext,
  ContextFlags,
  Enrollment,
  Incident,
  LiveSession,
  Mode,
  OperationsAction,
  ScorePoint,
  Source,
  ThresholdPreset,
} from "@/lib/types";

function sealPayload(incident: Incident) {
  return {
    id: incident.id,
    timestamp: incident.timestamp,
    score: incident.result.score,
    band: incident.result.band,
    label: incident.label,
    action: incident.action ?? null,
    reason: incident.actionReason ?? null,
  };
}

function attachHashSoon(
  incident: Incident,
  setIncidents: Dispatch<SetStateAction<Incident[]>>,
) {
  const payload = sealPayload(incident);
  const run = async () => {
    try {
      const hash = await integrityHash(payload);
      setIncidents((list) =>
        list.map((item) => (item.id === incident.id ? { ...item, integrityHash: hash } : item)),
      );
    } catch {
      const hash = integrityHashSyncFallback(payload);
      setIncidents((list) =>
        list.map((item) => (item.id === incident.id ? { ...item, integrityHash: hash } : item)),
      );
    }
  };
  void run();
}

const STORAGE_KEY = "voxshield.session.v1";

interface Persisted {
  mode: Mode;
  preset: ThresholdPreset;
  incidents: Incident[];
  context: ContextFlags;
  enrollment: Enrollment | null;
  scenarioId: string | null;
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
  enrollment: Enrollment | null;
  setEnrollment: (enrollment: Enrollment | null) => void;
  scenarioId: string | null;
  caller: CallerContext;
  loadScenario: (id: string) => string;
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
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [caller, setCaller] = useState<CallerContext>(SCENARIOS[1]?.caller ?? {
    cli: "+91 90000 18442",
    kycName: "Unknown caller",
    cliMatchesContact: false,
    transactionType: "Inquiry",
    amountInr: 0,
  });
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
    if (persisted.enrollment) setEnrollment(persisted.enrollment);
    if (persisted.scenarioId) {
      setScenarioId(persisted.scenarioId);
      const found = SCENARIOS.find((s) => s.id === persisted.scenarioId);
      if (found) setCaller(found.caller);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: Persisted = { mode, preset, incidents, context, enrollment, scenarioId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [hydrated, mode, preset, incidents, context, enrollment, scenarioId]);

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
      attachHashSoon(incident, setIncidents);
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
        attachHashSoon(incident, setIncidents);
      }
      return { ...prev, active: false, inputLevel: 0 };
    });
  }, [mode]);

  const recordAction = useCallback((action: OperationsAction, reason?: string) => {
    setIncidents((prev) => {
      if (!prev.length) return prev;
      const [head, ...rest] = prev;
      if (!head) return prev;
      const next = { ...head, action, actionReason: reason };
      attachHashSoon(next, setIncidents);
      return [next, ...rest];
    });
  }, []);

  const clearIncidents = useCallback(() => {
    setIncidents([]);
    setSelectedIncidentId(null);
  }, []);

  const loadScenario = useCallback((id: string) => {
    const scenario = SCENARIOS.find((s) => s.id === id);
    if (!scenario) return "/scenarios";
    setScenarioId(scenario.id);
    setMode(scenario.mode);
    setPresetState(scenario.preset);
    setContextState(scenario.context);
    setCaller(scenario.caller);
    const banded = reband(scenario.result, scenario.preset);
    setLastResult(banded);
    setLastLabel(scenario.title);
    setLastSource("demo");
    const incident: Incident = {
      id: `inc_${Date.now()}`,
      timestamp: new Date().toISOString(),
      mode: scenario.mode,
      durationMs: 42000,
      source: "demo",
      label: scenario.title,
      result: banded,
    };
    setIncidents((prev) => [incident, ...prev].slice(0, 40));
    setSelectedIncidentId(incident.id);
    attachHashSoon(incident, setIncidents);
    return scenario.mode === "protect" ? "/protect" : "/operations";
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
    enrollment,
    setEnrollment,
    scenarioId,
    caller,
    loadScenario,
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
