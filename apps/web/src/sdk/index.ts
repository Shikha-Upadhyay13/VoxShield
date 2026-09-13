/**
 * Thin VoxShield Core SDK — REST + WebSocket against docs/ENGINE.md §7.
 *
 * Adapters (call, bank) and the demo UI share this client. Do not invent fields;
 * types mirror apps/api/engine/schemas.py.
 */

export type {
  EngineHealth,
  EngineOk,
  EngineResponse,
  ThresholdPreset,
  Verdict,
} from "@/lib/types";

import type {
  EngineHealth,
  EngineOk,
  EngineResponse,
  ThresholdPreset,
} from "@/lib/types";

const DEFAULT_BASE = "http://127.0.0.1:8000";

export function baseUrl(override?: string): string {
  const configured =
    override?.trim() ||
    process.env.NEXT_PUBLIC_VOXSHIELD_API?.trim() ||
    DEFAULT_BASE;
  return configured.replace(/\/$/, "");
}

function wsBase(httpBase: string): string {
  return httpBase.replace(/^http/, "ws");
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

/** Integrator discovery: profile, models, calibrated, languages, endpoints. */
export interface Capabilities {
  name: string;
  version: string;
  profile: string;
  calibrated: boolean;
  models: Record<string, boolean>;
  languages: string[];
  scores: ["authenticity", "fraud"];
  verdicts: string[];
  endpoints: string[];
  notes: string[];
  warming?: boolean;
  ready?: boolean;
}

export async function fetchCapabilities(
  options: { base?: string; timeoutMs?: number } = {},
): Promise<Capabilities | null> {
  try {
    return await withTimeout(async (signal) => {
      const response = await fetch(`${baseUrl(options.base)}/v1/capabilities`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`capabilities ${response.status}`);
      return (await response.json()) as Capabilities;
    }, options.timeoutMs ?? 2500);
  } catch {
    return null;
  }
}

export async function fetchHealth(
  options: { base?: string; timeoutMs?: number } = {},
): Promise<EngineHealth | null> {
  try {
    return await withTimeout(async (signal) => {
      const response = await fetch(`${baseUrl(options.base)}/health`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`health ${response.status}`);
      return (await response.json()) as EngineHealth;
    }, options.timeoutMs ?? 2500);
  } catch {
    return null;
  }
}

export interface AnalyzeOptions {
  preset?: ThresholdPreset;
  language?: string | null;
  wantTranscript?: boolean;
  timeoutMs?: number;
  base?: string;
}

/** POST /analyze — multipart clip → authenticity + fraud + verdict. */
export async function analyze(
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
    const response = await fetch(`${baseUrl(options.base)}/analyze`, {
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
    const parsed = (await response.json()) as EngineResponse;
    return { ...parsed, source: "engine" } as EngineResponse;
  }, options.timeoutMs ?? 120_000);
}

/** Alias used by older demo hooks. */
export const analyzeBlob = analyze;

/** POST /score-text — fraud from captions / transcript alone. */
export async function scoreText(
  text: string,
  options: { preset?: ThresholdPreset; timeoutMs?: number; base?: string } = {},
): Promise<EngineOk> {
  const form = new FormData();
  form.append("text", text);
  form.append("preset", options.preset ?? "standard");

  return withTimeout(async (signal) => {
    const response = await fetch(`${baseUrl(options.base)}/score-text`, {
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
  /** Use `/ws/call-stream/{id}` instead of `/stream`. */
  callId?: string;
  base?: string;
}

/**
 * Open a live PCM16 stream to Core.
 * Prefer {@link connectStream} for new adapters; EngineStream remains for hooks.
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

  private streamUrl(): string {
    const http = baseUrl(this.config.base);
    const root = wsBase(http);
    if (this.config.callId) {
      return `${root}/ws/call-stream/${encodeURIComponent(this.config.callId)}`;
    }
    return `${root}/stream`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(this.streamUrl());
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
          /* ignore malformed frames */
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

/** Factory for adapters: connectStream({ sampleRate }, handlers). */
export function connectStream(config: StreamConfig, handlers: StreamHandlers): EngineStream {
  return new EngineStream(config, handlers);
}

export function isOk(response: EngineResponse | null | undefined): response is EngineOk {
  return response?.status === "ok";
}
