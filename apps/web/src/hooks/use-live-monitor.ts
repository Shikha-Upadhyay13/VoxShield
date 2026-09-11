"use client";

import { useCallback, useRef, useState } from "react";
import { downsample, floatToMono } from "@/lib/audio";
import { extractFeatures, scoreFromFeatures } from "@/lib/scoring";
import type { ContextFlags, ThresholdPreset } from "@/lib/types";

interface Options {
  context: ContextFlags;
  preset: ThresholdPreset;
  onLevel: (level: number) => void;
  onScore: (payload: {
    score: number;
    band: string;
    result: ReturnType<typeof scoreFromFeatures>;
    tMs: number;
  }) => void;
}

export function useLiveMonitor() {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef<Options | null>(null);
  const graphRef = useRef<{
    ctx: AudioContext;
    source: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    processor: ScriptProcessorNode;
    stream: MediaStream;
    startedAt: number;
    samples: Float32Array[];
    lastScoreAt: number;
  } | null>(null);

  const start = useCallback(async (options: Options) => {
    optionsRef.current = options;
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 2048;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const startedAt = Date.now();
    const samples: Float32Array[] = [];

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      samples.push(new Float32Array(input));
      if (samples.length > 24) samples.shift();

      const opts = optionsRef.current;
      if (!opts) return;
      let peak = 0;
      for (let i = 0; i < input.length; i += 1) peak = Math.max(peak, Math.abs(input[i] ?? 0));
      opts.onLevel(Math.min(1, peak * 3));

      const now = Date.now();
      const graph = graphRef.current;
      if (!graph || now - graph.lastScoreAt < 1200) return;
      graph.lastScoreAt = now;

      const merged = lastSeconds(merge(samples), ctx.sampleRate, 1.8);
      const { samples: mono, sampleRate } = downsample(merged, ctx.sampleRate, 16000);
      const features = extractFeatures(mono, sampleRate);
      const result = scoreFromFeatures(features, opts.context, opts.preset);
      opts.onScore({
        score: result.score,
        band: result.band,
        result,
        tMs: now - startedAt,
      });
    };

    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(analyserNode);
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
    setAnalyser(analyserNode);
    graphRef.current = {
      ctx,
      source,
      analyser: analyserNode,
      processor,
      stream,
      startedAt,
      samples,
      lastScoreAt: 0,
    };
  }, []);

  const stop = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.processor.disconnect();
    graph.source.disconnect();
    graph.stream.getTracks().forEach((t) => t.stop());
    void graph.ctx.close();
    graphRef.current = null;
    setAnalyser(null);
  }, []);

  const analyzeBuffer = useCallback(
    (buffer: AudioBuffer, context: ContextFlags, preset: ThresholdPreset) => {
      const { samples, sampleRate } = downsample(floatToMono(buffer), buffer.sampleRate, 16000);
      const features = extractFeatures(samples, sampleRate);
      return scoreFromFeatures(features, context, preset);
    },
    [],
  );

  const updateOptions = useCallback((options: Options) => {
    optionsRef.current = options;
  }, []);

  return { analyser, error, setError, start, stop, analyzeBuffer, updateOptions };
}

function lastSeconds(samples: Float32Array, sampleRate: number, seconds: number): Float32Array {
  const keep = Math.floor(sampleRate * seconds);
  if (samples.length <= keep) return samples;
  return samples.slice(samples.length - keep);
}

function merge(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
