export type Mode = "protect" | "operations";
export type Band = "genuine" | "review" | "high" | "insufficient";
export type Source = "live" | "upload" | "demo";
export type ThresholdPreset = "standard" | "high_value";
export type OperationsAction = "hold" | "mfa" | "escalate" | "allow";

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
