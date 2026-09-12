export type Mode = "protect" | "operations";
export type Band = "genuine" | "review" | "high" | "insufficient";
export type Source = "live" | "upload" | "demo";
export type ThresholdPreset = "standard" | "high_value";
export type OperationsAction = "hold" | "mfa" | "escalate" | "allow";

/* ---------------------------------------------------------------------------
 * Detection engine contract.
 *
 * These types mirror docs/ENGINE.md Section 7 field for field, including the
 * snake_case coming off the Python API. If you rename a field here, rename it in
 * apps/api/engine/schemas.py and ENGINE.md in the same commit.
 * ------------------------------------------------------------------------- */

export type ScoreBand = "genuine" | "review" | "high";

export type Verdict =
  | "clear"
  | "review"
  | "synthetic_benign"
  | "fraud_human"
  | "critical"
  | "insufficient_audio";

/** Where a displayed score came from. Fallback numbers must never be quoted as accuracy. */
export type EngineSource = "engine" | "browser-fallback";

export interface EngineSignal {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  suspicion: number | null;
  reason: string;
}

export interface EngineNeuralComponent {
  score: number | null;
  models: Record<string, number | null>;
  disagreement: number | null;
}

export interface EngineScoreComponent {
  score: number | null;
}

export interface EngineAuthenticity {
  score: number;
  band: ScoreBand;
  label: string;
  degraded: boolean;
  components: {
    neural: EngineNeuralComponent;
    dsp: EngineScoreComponent;
    disfluency: EngineScoreComponent;
  };
  signals: EngineSignal[];
}

export interface EngineMatchedTerm {
  category: string;
  term: string;
}

export interface EngineFraud {
  score: number;
  band: ScoreBand;
  label: string;
  transcript_available: boolean;
  components: {
    classifier: { score: number | null; model: string | null };
    lexicon: { score: number | null; categories: string[] };
    amount: { score: number | null; detected_inr: number | null; raw: string | null };
  };
  matched_terms: EngineMatchedTerm[];
  category?: string | null;
  transcript?: string | null;
}

export interface EngineMeta {
  window_ms: number | null;
  audio_ms: number;
  latency_ms: number;
  profile: string;
  retention: string;
  engine_version: string;
  t_ms?: number | null;
  partial?: boolean | null;
}

export interface EngineOk {
  status: "ok";
  verdict: Verdict;
  confidence: number;
  authenticity: EngineAuthenticity;
  fraud: EngineFraud;
  meta: EngineMeta;
  source?: EngineSource;
}

export interface EngineInsufficient {
  status: "insufficient_audio";
  verdict: "insufficient_audio";
  reason: string;
  meta: Partial<EngineMeta>;
  source?: EngineSource;
}

export type EngineResponse = EngineOk | EngineInsufficient;

export interface EngineHealth {
  status: string;
  profile: string;
  engine_version: string;
  calibrated: boolean;
  models: Record<string, boolean>;
  notes: string[];
}

export interface VerdictCopy {
  headline: string;
  hindi: string;
  body: string;
  action: string;
  tone: ScoreBand | "insufficient";
}

/** Plain-language copy per verdict. Protect mode reads these out to a non-technical victim. */
export const VERDICT_COPY: Record<Verdict, VerdictCopy> = {
  critical: {
    headline: "This voice may be AI-generated, and it is asking for money or codes",
    hindi: "यह आवाज़ नकली हो सकती है। पैसे या OTP मत भेजिए।",
    body: "Two things went wrong at once: the voice does not look human, and the caller is using scam tactics. This is what a voice-cloning fraud looks like.",
    action: "Hang up. Call the person back on a number you already have saved. Never share an OTP.",
    tone: "high",
  },
  fraud_human: {
    headline: "This caller is using scam tactics",
    hindi: "यह कॉल धोखाधड़ी की कोशिश लग रही है।",
    body: "The voice itself looks like a real person, but the words match known fraud patterns. A real human running a scam script is still a scam.",
    action: "Hang up and call back on a saved number before you send anything.",
    tone: "high",
  },
  synthetic_benign: {
    headline: "This voice looks synthetic, but is not asking for anything",
    hindi: "यह आवाज़ नकली लग रही है, लेकिन कुछ मांग नहीं रही।",
    body: "The audio shows synthetic patterns. That can also mean an automated announcement or a voice assistant, so it is not automatically an attack.",
    action: "Stay alert. If it starts asking for money or codes, hang up.",
    tone: "review",
  },
  review: {
    headline: "Something is off about this call",
    hindi: "इस कॉल में कुछ ठीक नहीं लग रहा।",
    body: "Some signals look unusual, but not enough to be certain. Treat it as unverified.",
    action: "Call them back on a saved number before you send money or share codes.",
    tone: "review",
  },
  clear: {
    headline: "Voice looks consistent with a human speaker",
    hindi: "आवाज़ असली इंसान की लग रही है।",
    body: "No synthetic patterns and no fraud language detected in this window.",
    action: "Stay alert anyway. No detector is perfect.",
    tone: "genuine",
  },
  insufficient_audio: {
    headline: "Not enough speech to judge",
    hindi: "फ़ैसला करने के लिए पर्याप्त आवाज़ नहीं मिली।",
    body: "There was too little voiced audio to analyse. The engine does not guess on silence.",
    action: "Keep the call going, or upload a longer clip.",
    tone: "insufficient",
  },
};

/** Short label per verdict, for chips and tables. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  critical: "Critical",
  fraud_human: "Human scam",
  synthetic_benign: "Synthetic",
  review: "Review",
  clear: "Clear",
  insufficient_audio: "No signal",
};

export const OPERATIONS_RECOMMENDATION: Record<Verdict, OperationsAction | null> = {
  critical: "hold",
  fraud_human: "hold",
  synthetic_benign: "mfa",
  review: "mfa",
  clear: null,
  insufficient_audio: null,
};

export interface LayerScore {
  score: number | null;
  reasons: string[];
}

export interface Layers {
  acoustic: LayerScore;
  prosody: LayerScore;
  neural: LayerScore;
  context: LayerScore;
}

export interface AnalysisResult {
  score: number;
  band: Band;
  layers: Layers;
  windowMs: number;
  retention: "features_only";
}

export interface ScorePoint {
  tMs: number;
  score: number;
}

export interface ContextFlags {
  unknownNumber: boolean;
  firstTimeCaller: boolean;
  urgencyLanguage: boolean;
}

export interface CallerContext {
  cli: string;
  kycName: string;
  cliMatchesContact: boolean;
  transactionType: string;
  amountInr: number;
}

export interface Incident {
  id: string;
  timestamp: string;
  mode: Mode;
  durationMs: number;
  source: Source;
  label: string;
  result: AnalysisResult;
  action?: OperationsAction;
  actionReason?: string;
}

export interface LiveSession {
  active: boolean;
  startedAt: number | null;
  source: Source;
  label: string;
  result: AnalysisResult | null;
  timeline: ScorePoint[];
  inputLevel: number;
  insufficient: boolean;
}

export interface Enrollment {
  name: string;
  relation: string;
  enrolledAt: string;
  features: { pitch: number; centroid: number; flatness: number };
}

export interface Scenario {
  id: string;
  title: string;
  victim: string;
  line: string;
  mode: Mode;
  preset: ThresholdPreset;
  context: ContextFlags;
  caller: CallerContext;
  result: AnalysisResult;
}

export interface Thresholds {
  review: number;
  high: number;
}

export const THRESHOLDS: Record<ThresholdPreset, Thresholds> = {
  standard: { review: 40, high: 70 },
  high_value: { review: 30, high: 55 },
};

export const LAYER_WEIGHTS = {
  acoustic: 0.4,
  prosody: 0.3,
  neural: 0.2,
  context: 0.1,
} as const;
