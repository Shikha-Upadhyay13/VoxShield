"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeBlob,
  fetchHealth,
  legacyToEngine,
} from "@/lib/engine-client";
import { extractFeatures, scoreFromFeatures } from "@/lib/scoring";
import { downsample, floatToMono } from "@/lib/audio";
import type {
  ContextFlags,
  EngineHealth,
  EngineResponse,
  ThresholdPreset,
} from "@/lib/types";

export type EngineState = "checking" | "online" | "offline";

/**
 * Engine availability plus a file-analysis path that degrades to the browser scorer.
 *
 * The fallback exists so a demo never hard-fails in front of a judge, but its results
 * are tagged `browser-fallback` and rendered with a warning: it has no neural layer
 * and no transcript, so it cannot do fraud detection at all.
 */
export function useEngine() {
  const [state, setState] = useState<EngineState>("checking");
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const result = await fetchHealth();
    if (!mounted.current) return result;
    setHealth(result);
    setState(result ? "online" : "offline");
    return result;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    // Faster poll while warming / offline so cold Render recovers without a full reload.
    const timer = setInterval(() => void refresh(), health?.warming || state !== "online" ? 5_000 : 15_000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh, health?.warming, state]);

  /** Analyse a file through the engine, falling back to the browser scorer. */
  const analyzeFile = useCallback(
    async (
      file: Blob,
      filename: string,
      options: {
        preset: ThresholdPreset;
        context: ContextFlags;
        language?: string | null;
        decoded?: AudioBuffer;
      },
    ): Promise<{ result: EngineResponse; usedFallback: boolean; error?: string }> => {
      try {
        const result = await analyzeBlob(file, filename, {
          preset: options.preset,
          language: options.language ?? null,
          wantTranscript: true,
        });
        if (mounted.current) setState("online");
        return { result, usedFallback: false };
      } catch (error) {
        if (mounted.current) setState("offline");
        const message =
          error instanceof Error ? error.message : "Detection engine is not reachable.";

        // Fall back to the in-browser scorer so the screen still shows something real.
        const buffer = options.decoded;
        if (!buffer) {
          throw new Error(message);
        }
        const { samples, sampleRate } = downsample(floatToMono(buffer), buffer.sampleRate, 16000);
        const features = extractFeatures(samples, sampleRate);
        const legacy = scoreFromFeatures(features, options.context, options.preset);
        return {
          result: legacyToEngine(legacy, options.context, options.preset),
          usedFallback: true,
          error: message,
        };
      }
    },
    [],
  );

  return { state, health, refresh, analyzeFile };
}
