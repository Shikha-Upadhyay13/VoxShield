"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  onAnalysing?: (info: { tMs: number; audioMs: number }) => void;
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
/** Soft boost so quiet laptop mics clear the engine's energy gate. */
const INPUT_GAIN = 2.4;

/**
 * Live microphone capture that streams to the Python engine.
 *
 * Echo cancellation and noise suppression are off on purpose for this demo path: on a
 * laptop talking into its own mic they often erase the very speech we need to score
 * (stream logs showed Whisper VAD deleting entire windows). Production hosts that already
 * clean the call audio can leave their own DSP on.
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
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();

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
          onReady: (info) => {
            if (info.note) optionsRef.current?.onNotice(info.note);
          },
          onAnalysing: (info) => {
            optionsRef.current?.onAnalysing?.(info);
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

        // Soft-clip after gain so peaks do not wrap into noise.
        const boosted = new Float32Array(input.length);
        let peak = 0;
        for (let i = 0; i < input.length; i += 1) {
          const sample = Math.max(-1, Math.min(1, (input[i] ?? 0) * INPUT_GAIN));
          boosted[i] = sample;
          peak = Math.max(peak, Math.abs(sample));
        }
        opts.onLevel(Math.min(1, peak));

        const active = graphRef.current;
        if (!active) return;

        if (active.socket?.isOpen) {
          active.socket.send(boosted);
          return;
        }

        active.localBuffer.push(boosted);
        if (active.localBuffer.length > 24) active.localBuffer.shift();
        const now = Date.now();
        if (now - active.lastLocalScoreAt < LOCAL_INTERVAL_MS) return;
        active.lastLocalScoreAt = now;
        scoreLocally(active);
      };

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
