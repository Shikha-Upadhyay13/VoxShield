/**
 * Demo-app client wrappers around the Core SDK (`@/sdk`).
 *
 * Prefer importing from `@/sdk` in new adapters. This module keeps browser-fallback
 * helpers and legacy projection used by Protect / Operations history screens.
 */

export {
  analyze,
  analyzeBlob,
  baseUrl as engineBaseUrl,
  connectStream,
  EngineStream,
  fetchCapabilities,
  fetchHealth,
  isOk,
  scoreText,
} from "@/sdk";
export type {
  AnalyzeOptions,
  Capabilities,
  StreamConfig,
  StreamHandlers,
} from "@/sdk";

import type {
  AnalysisResult,
  ContextFlags,
  EngineOk,
  EngineResponse,
  ScoreBand,
  ThresholdPreset,
  Verdict,
} from "@/lib/types";

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

  const verdict: Verdict =
    authenticityBand === "high"
      ? "synthetic_benign"
      : authenticityBand === "review"
        ? "review"
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
        lexicon: { score: null, categories: [], intents: [] },
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

/**
 * Project an engine result back into the legacy four-layer shape.
 * Lossy on purpose — used for history and banding only.
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
        reasons:
          authenticity.components.neural.score === null
            ? ["Neural models not loaded."]
            : [
                `Two detectors agree at ${(authenticity.components.neural.score * 100).toFixed(0)}% synthetic.`,
              ],
      },
      context: {
        score: fraud.score / 100,
        reasons: fraud.matched_terms.length
          ? [`Fraud signals: ${fraud.matched_terms.map((t) => t.term).join(", ")}`]
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
