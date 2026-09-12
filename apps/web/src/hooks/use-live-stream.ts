"use client";

import { useCallback, useRef, useState } from "react";
import { EngineStream, legacyToEngine } from "@/lib/engine-client";
import { downsample } from "@/lib/audio";
import { extractFeatures, scoreFromFeatures } from "@/lib/scoring";
import type {
  ContextFlags,
  EngineResponse,
  ThresholdPreset,
} from "@/lib/types";

interface StreamOptions {
  context: ContextFlags;
  preset: ThresholdPreset;
  language?: string | null;
  onLevel: (level: number) => void;
  onResult: (result: EngineResponse, tMs: number) => void;
  onNotice: (message: string | null) => void;
}

interface Graph {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  processor: ScriptProcessorNode;
  stream: MediaStream;
  startedAt: number;
  socket: EngineStream | null;
  localBuffer: Float32Array[];
  lastLocalScoreAt: number;
}

const LOCAL_WINDOW_S = 1.8;
const LOCAL_INTERVAL_MS = 1200;

/**
 * Live microphone capture that streams to the Python engine.
 *
 * Audio is sent at the browser's native sample rate rather than downsampled first,
 * because the high-frequency ceiling signal needs headroom above 8 kHz to mean
 * anything. The engine downsamples for the models on its side.
 *
 * If the engine cannot be reached, capture continues and scoring falls back to the
 * in-browser scorer so the demo keeps moving. Fallback results are tagged as such.
 */
export function useLiveStream() {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const optionsRef = useRef<StreamOptions | null>(null);
  const graphRef = useRef<Graph | null>(null);

  const updateOptions = useCallback((options: StreamOptions) => {
    optionsRef.current = options;
  }, []);

  const scoreLocally = useCallback((graph: Graph) => {
    const opts = optionsRef.current;
    if (!opts) return;
    const merged = mergeTail(graph.localBuffer, graph.ctx.sampleRate, LOCAL_WINDOW_S);
    if (merged.length === 0) return;
    const { samples, sampleRate } = downsample(merged, graph.ctx.sampleRate, 16000);
    const legacy = scoreFromFeatures(
      extractFeatures(samples, sampleRate),
      opts.context,
      opts.preset,
    );
    opts.onResult(
      legacyToEngine(legacy, opts.context, opts.preset),
      Date.now() - graph.startedAt,
    );
  }, []);

  const start = useCallback(
    async (options: StreamOptions) => {
      optionsRef.current = options;
      setError(null);
      setUsingFallback(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 2048;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const startedAt = Date.now();

      const graph: Graph = {
        ctx,
        source,
        analyser: analyserNode,
        processor,
        stream,
        startedAt,
        socket: null,
        localBuffer: [],
        lastLocalScoreAt: 0,
      };

      // Try the engine first. If it is not there, keep capturing and score locally.
      const socket = new EngineStream(
        {
          sampleRate: ctx.sampleRate,
          preset: options.preset,
          language: options.language ?? null,
        },
        {
          onResult: (result) => {
            optionsRef.current?.onResult(result, Date.now() - startedAt);
          },
          onError: (message) => {
            setUsingFallback(true);
            optionsRef.current?.onNotice(
              `${message} Falling back to the in-browser scorer, which cannot read the words.`,
            );
          },
          onClose: () => {
            if (graphRef.current) {
              setUsingFallback(true);
              optionsRef.current?.onNotice(
                "Engine stream closed. Falling back to the in-browser scorer.",
              );
            }
          },
        },
      );

      try {
        await socket.connect();
        graph.socket = socket;
        options.onNotice(null);
      } catch {
        graph.socket = null;
        setUsingFallback(true);
        options.onNotice(
          "Detection engine is not running, so this session uses the in-browser fallback. " +
            "Start it with 'uvicorn main:app --port 8000' in apps/api for real detection.",
        );
      }

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const opts = optionsRef.current;
        if (!opts) return;

        let peak = 0;
        for (let i = 0; i < input.length; i += 1) peak = Math.max(peak, Math.abs(input[i] ?? 0));
        opts.onLevel(Math.min(1, peak * 3));

        const active = graphRef.current;
        if (!active) return;

        if (active.socket?.isOpen) {
          active.socket.send(new Float32Array(input));
          return;
        }

        // Fallback path: keep a rolling buffer and score in the browser.
        active.localBuffer.push(new Float32Array(input));
        if (active.localBuffer.length > 24) active.localBuffer.shift();
        const now = Date.now();
        if (now - active.lastLocalScoreAt < LOCAL_INTERVAL_MS) return;
        active.lastLocalScoreAt = now;
        scoreLocally(active);
      };

      // Route through a silent gain node; connecting straight to the destination
      // would feed the speakers back into the microphone.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(analyserNode);
      source.connect(processor);
      processor.connect(mute);
      mute.connect(ctx.destination);

      setAnalyser(analyserNode);
      graphRef.current = graph;
    },
    [scoreLocally],
  );

  const stop = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graphRef.current = null;
    graph.socket?.stop();
    graph.processor.onaudioprocess = null;
    graph.processor.disconnect();
    graph.source.disconnect();
    graph.stream.getTracks().forEach((track) => track.stop());
    void graph.ctx.close();
    setAnalyser(null);
  }, []);

  return { analyser, error, setError, usingFallback, start, stop, updateOptions };
}

function mergeTail(chunks: Float32Array[], sampleRate: number, seconds: number): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const keep = Math.floor(sampleRate * seconds);
  return merged.length <= keep ? merged : merged.slice(merged.length - keep);
}
