/**
 * Client for the Python detection engine (docs/ENGINE.md Section 7).
 *
 * The engine is the source of truth. When it is unreachable, the UI degrades to the
 * in-browser scorer in scoring.ts, and every such result is tagged
 * `source: "browser-fallback"` so it can be labelled on screen. Fallback numbers are
 * never presented as detection accuracy.
 */

import type {
  AnalysisResult,
  ContextFlags,
  EngineHealth,
  EngineOk,
  EngineResponse,
  ScoreBand,
  ThresholdPreset,
  Verdict,
} from "@/lib/types";

const DEFAULT_BASE = "http://127.0.0.1:8000";

export function engineBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_VOXSHIELD_API?.trim();
  return (configured && configured.length > 0 ? configured : DEFAULT_BASE).replace(/\/$/, "");
}

function streamUrl(): string {
  const base = engineBaseUrl();
  return `${base.replace(/^http/, "ws")}/stream`;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHealth(timeoutMs = 2500): Promise<EngineHealth | null> {
  try {
    return await withTimeout(async (signal) => {
      const response = await fetch(`${engineBaseUrl()}/health`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error(`health ${response.status}`);
      return (await response.json()) as EngineHealth;
    }, timeoutMs);
  } catch {
    return null;
  }
}

export interface AnalyzeOptions {
  preset?: ThresholdPreset;
  language?: string | null;
  wantTranscript?: boolean;
  timeoutMs?: number;
}

/** Upload a file (or recorded Blob) for whole-clip analysis. Throws if the engine is down. */
export async function analyzeBlob(
  blob: Blob,
  filename = "audio.wav",
  options: AnalyzeOptions = {},
): Promise<EngineResponse> {
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("preset", options.preset ?? "standard");
  if (options.language) form.append("language", options.language);
  form.append("want_transcript", String(options.wantTranscript ?? true));

  return withTimeout(async (signal) => {
    const response = await fetch(`${engineBaseUrl()}/analyze`, {
      method: "POST",
      body: form,
      signal,
    });
    if (!response.ok) {
      let detail = `Engine returned ${response.status}`;
      try {
        const body = (await response.json()) as { reason?: string };
        if (body.reason) detail = body.reason;
      } catch {
        /* keep the status-code message */
      }
      throw new Error(detail);
    }
    const parsed = (await response.json()) as EngineResponse;
    return { ...parsed, source: "engine" } as EngineResponse;
  }, options.timeoutMs ?? 120_000);
}

/**
 * Score fraud from live captions / transcript text alone.
 *
 * Browser captions are immediate; Whisper on CPU is not. The live monitor calls this
 * as soon as words appear so the fraud ring can turn red on a spoken scam script.
 */
export async function scoreText(
  text: string,
  options: { preset?: ThresholdPreset; timeoutMs?: number } = {},
): Promise<EngineOk> {
  const form = new FormData();
  form.append("text", text);
  form.append("preset", options.preset ?? "standard");

  return withTimeout(async (signal) => {
    const response = await fetch(`${engineBaseUrl()}/score-text`, {
      method: "POST",
      body: form,
      signal,
    });
    if (!response.ok) {
      let detail = `Engine returned ${response.status}`;
      try {
        const body = (await response.json()) as { reason?: string };
        if (body.reason) detail = body.reason;
      } catch {
        /* keep status */
      }
      throw new Error(detail);
    }
    const payload = (await response.json()) as EngineOk;
    return { ...payload, source: "engine" };
  }, options.timeoutMs ?? 20_000);
}

/* ---------------------------------------------------------------------------
 * Live streaming
 * ------------------------------------------------------------------------- */

export interface StreamHandlers {
  onResult: (result: EngineResponse) => void;
  onReady?: (info: { sampleRate: number; engineVersion: string; note?: string }) => void;
  onAnalysing?: (info: { tMs: number; audioMs: number }) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

export interface StreamConfig {
  sampleRate: number;
  preset?: ThresholdPreset;
  language?: string | null;
}

/**
 * WebSocket wrapper that sends PCM16 frames to the engine.
 *
 * Audio is sent at the browser's native sample rate rather than downsampled to
 * 16 kHz, because the high-frequency ceiling signal needs headroom above 8 kHz to
 * mean anything. The engine resamples for the models itself.
 */
export class EngineStream {
  private socket: WebSocket | null = null;
  private readonly handlers: StreamHandlers;
  private readonly config: StreamConfig;
  private opened = false;
  private closedByUs = false;
  private pending: ArrayBuffer[] = [];

  constructor(config: StreamConfig, handlers: StreamHandlers) {
    this.config = config;
    this.handlers = handlers;
  }

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(streamUrl());
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Could not open engine stream."));
        return;
      }
      socket.binaryType = "arraybuffer";
      this.socket = socket;

      const failIfUnopened = () => {
        if (!this.opened) reject(new Error("Detection engine is not reachable."));
      };

      socket.onopen = () => {
        this.opened = true;
        socket.send(
          JSON.stringify({
            type: "start",
            sample_rate: Math.round(this.config.sampleRate),
            preset: this.config.preset ?? "standard",
            language: this.config.language ?? null,
          }),
        );
        // Flush anything captured while the socket was still connecting.
        for (const buffer of this.pending) socket.send(buffer);
        this.pending = [];
        resolve();
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const parsed = JSON.parse(event.data) as
            | EngineResponse
            | {
                status: "ready";
                sample_rate: number;
                engine_version: string;
                note?: string;
              }
            | { status: "analysing"; t_ms?: number; audio_ms?: number }
            | { status: "error"; reason: string };

          if (parsed.status === "ready") {
            this.handlers.onReady?.({
              sampleRate: parsed.sample_rate,
              engineVersion: parsed.engine_version,
              note: parsed.note,
            });
            return;
          }
          if (parsed.status === "analysing") {
            this.handlers.onAnalysing?.({
              tMs: parsed.t_ms ?? 0,
              audioMs: parsed.audio_ms ?? 0,
            });
            return;
          }
          if (parsed.status === "error") {
            this.handlers.onError?.(parsed.reason);
            return;
          }
          this.handlers.onResult({ ...parsed, source: "engine" } as EngineResponse);
        } catch {
          /* ignore malformed frames rather than tearing down the session */
        }
      };

      socket.onerror = () => {
        failIfUnopened();
        if (this.opened && !this.closedByUs) {
          this.handlers.onError?.("Lost connection to the detection engine.");
        }
      };

      socket.onclose = () => {
        failIfUnopened();
        this.socket = null;
        if (!this.closedByUs) this.handlers.onClose?.();
      };
    });
  }

  /** Send one frame of mono float32 audio, converted to little-endian PCM16. */
  send(samples: Float32Array): void {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
      pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    const buffer = pcm.buffer as ArrayBuffer;
    if (this.isOpen) {
      this.socket?.send(buffer);
      return;
    }
    // Buffer briefly during connect, but do not grow without bound.
    if (this.pending.length < 24) this.pending.push(buffer);
  }

  stop(): void {
    this.closedByUs = true;
    if (this.isOpen) {
      try {
        this.socket?.send(JSON.stringify({ type: "stop" }));
      } catch {
        /* socket already gone */
      }
    }
    this.socket?.close();
    this.socket = null;
    this.pending = [];
  }
}

/* ---------------------------------------------------------------------------
 * Fallback adapter
 * ------------------------------------------------------------------------- */

const FALLBACK_LABELS: Record<ScoreBand, string> = {
  genuine: "Consistent with a human speaker",
  review: "Some synthetic patterns",
  high: "Likely AI-generated",
};

function bandFor(score: number, review: number, high: number): ScoreBand {
  if (score >= high) return "high";
  if (score >= review) return "review";
  return "genuine";
}

/**
 * Present a browser-scored result in the engine's shape so the UI has one rendering
 * path. Marked `browser-fallback` and reported as degraded, because this scorer has
 * no neural layer, no transcript, and therefore no real fraud detection.
 */
export function legacyToEngine(
  legacy: AnalysisResult,
  context: ContextFlags,
  preset: ThresholdPreset,
): EngineResponse {
  const review = preset === "high_value" ? 30 : 40;
  const high = preset === "high_value" ? 55 : 70;

  if (legacy.band === "insufficient") {
    return {
      status: "insufficient_audio",
      verdict: "insufficient_audio",
      reason: "Not enough voiced speech to judge.",
      meta: { window_ms: legacy.windowMs, retention: "features_only", engine_version: "fallback" },
      source: "browser-fallback",
    };
  }

  const authenticityScore = legacy.score;
  const authenticityBand = bandFor(authenticityScore, review, high);

  // The browser scorer has no transcript, so "fraud" can only reflect the manual
  // context toggles. It is deliberately capped well below the alert threshold.
  const contextHits = [context.unknownNumber, context.firstTimeCaller, context.urgencyLanguage].filter(
    Boolean,
  ).length;
  const fraudScore = Math.min(34, contextHits * 12);

  const signals = [
    ...legacy.layers.acoustic.reasons.map((reason, index) => ({
      key: `fallback_acoustic_${index}`,
      label: "Acoustic",
      value: null,
      unit: "",
      suspicion: legacy.layers.acoustic.score,
      reason,
    })),
    ...legacy.layers.prosody.reasons.map((reason, index) => ({
      key: `fallback_prosody_${index}`,
      label: "Prosody",
      value: null,
      unit: "",
      suspicion: legacy.layers.prosody.score,
      reason,
    })),
  ];

  const verdict: Verdict = authenticityBand === "high" ? "synthetic_benign"
    : authenticityBand === "review" ? "review"
    : "clear";

  const result: EngineOk = {
    status: "ok",
    verdict,
    confidence: 0.35,
    authenticity: {
      score: authenticityScore,
      band: authenticityBand,
      label: FALLBACK_LABELS[authenticityBand],
      degraded: true,
      components: {
        neural: { score: null, models: {}, disagreement: null },
        dsp: { score: legacy.layers.acoustic.score },
        disfluency: { score: null },
      },
      signals,
    },
    fraud: {
      score: fraudScore,
      band: "genuine",
      label: "Not assessed without the engine",
      transcript_available: false,
      components: {
        classifier: { score: null, model: null },
        lexicon: { score: null, categories: [] },
        amount: { score: null, detected_inr: null, raw: null },
      },
      matched_terms: [],
    },
    meta: {
      window_ms: legacy.windowMs,
      audio_ms: legacy.windowMs,
      latency_ms: 0,
      profile: "browser-fallback",
      retention: "features_only",
      engine_version: "fallback",
    },
    source: "browser-fallback",
  };
  return result;
}

export function isOk(response: EngineResponse | null): response is EngineOk {
  return response?.status === "ok";
}

/**
 * Project an engine result back into the legacy four-layer shape.
 *
 * The session store, incident history, Protect, and Operations screens were all built
 * against the single-score model. Rather than rewrite them, we map the engine's
 * richer output down to that shape so the whole app keeps working while the detailed
 * two-score view renders from the engine result directly.
 *
 * The mapping is lossy on purpose and only used for history and banding.
 */
export function engineToLegacy(response: EngineResponse): AnalysisResult {
  if (response.status === "insufficient_audio") {
    return {
      score: 0,
      band: "insufficient",
      layers: {
        acoustic: { score: null, reasons: [response.reason] },
        prosody: { score: null, reasons: [] },
        neural: { score: null, reasons: [] },
        context: { score: null, reasons: [] },
      },
      windowMs: response.meta.window_ms ?? 0,
      retention: "features_only",
    };
  }

  const { authenticity, fraud } = response;
  const signalReason = (key: string): string[] => {
    const found = authenticity.signals.find((s) => s.key === key);
    return found && found.suspicion !== null ? [found.reason] : [];
  };

  return {
    score: authenticity.score,
    band: authenticity.band,
    layers: {
      acoustic: {
        score: authenticity.components.dsp.score,
        reasons: [...signalReason("hf_cutoff"), ...signalReason("spectral_flatness")],
      },
      prosody: {
        score: authenticity.components.dsp.score,
        reasons: [
          ...signalReason("pitch_stability"),
          ...signalReason("jitter"),
          ...signalReason("pause_regularity"),
        ],
      },
      neural: {
        score: authenticity.components.neural.score,
        reasons: authenticity.components.neural.score === null
          ? ["Neural models not loaded."]
          : [`Two detectors agree at ${(authenticity.components.neural.score * 100).toFixed(0)}% synthetic.`],
      },
      context: {
        score: fraud.score / 100,
        reasons: fraud.matched_terms.length
          ? [`Fraud keywords: ${fraud.matched_terms.map((t) => t.term).join(", ")}`]
          : [],
      },
    },
    windowMs: response.meta.window_ms ?? response.meta.audio_ms,
    retention: "features_only",
  };
}

/** Signals ordered by how incriminating they are, for alerts and summaries. */
export function topReasons(result: EngineOk, limit = 3): string[] {
  return [...result.authenticity.signals]
    .filter((signal) => signal.suspicion !== null)
    .sort((a, b) => (b.suspicion ?? 0) - (a.suspicion ?? 0))
    .slice(0, limit)
    .map((signal) => signal.reason);
}
