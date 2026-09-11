import {
  LAYER_WEIGHTS,
  THRESHOLDS,
  type AnalysisResult,
  type Band,
  type ContextFlags,
  type LayerScore,
  type ThresholdPreset,
} from "./types";

export interface AcousticFeatures {
  rms: number;
  rmsVariance: number;
  zcr: number;
  centroid: number;
  flatness: number;
  rolloff: number;
  highFreqRatio: number;
  pitchHz: number;
  pitchVariance: number;
  voicedRatio: number;
  durationMs: number;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return mean(values.map((v) => (v - m) ** 2));
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function extractFeatures(samples: Float32Array, sampleRate: number): AcousticFeatures {
  const windowSize = 1024;
  const hop = 512;
  const rmsWindows: number[] = [];
  const zcrWindows: number[] = [];
  const centroidWindows: number[] = [];
  const flatnessWindows: number[] = [];
  const rolloffWindows: number[] = [];
  const highWindows: number[] = [];
  const pitches: number[] = [];
  let voiced = 0;
  let windows = 0;

  const re = new Float32Array(windowSize);
  const im = new Float32Array(windowSize);
  const spectrum = new Float32Array(windowSize / 2);

  for (let start = 0; start + windowSize < samples.length; start += hop) {
    windows += 1;
    let energy = 0;
    let crossings = 0;
    for (let i = 0; i < windowSize; i += 1) {
      const s = samples[start + i] ?? 0;
      energy += s * s;
      const prev = samples[start + i - 1] ?? 0;
      if (i > 0 && ((s >= 0 && prev < 0) || (s < 0 && prev >= 0))) crossings += 1;
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
      re[i] = s * w;
      im[i] = 0;
    }
    const rms = Math.sqrt(energy / windowSize);
    rmsWindows.push(rms);
    zcrWindows.push(crossings / windowSize);

    fft(re, im);
    for (let k = 0; k < spectrum.length; k += 1) {
      spectrum[k] = Math.hypot(re[k] ?? 0, im[k] ?? 0);
    }
    const { centroid, flatness, rolloff, highRatio } = spectralStats(spectrum, sampleRate, windowSize);
    centroidWindows.push(centroid);
    flatnessWindows.push(flatness);
    rolloffWindows.push(rolloff);
    highWindows.push(highRatio);

    const pitch = estimatePitch(samples, start, windowSize, sampleRate);
    if (pitch > 60 && pitch < 400 && rms > 0.012) {
      pitches.push(pitch);
      voiced += 1;
    }
  }

  const durationMs = (samples.length / sampleRate) * 1000;

  return {
    rms: mean(rmsWindows),
    rmsVariance: variance(rmsWindows),
    zcr: mean(zcrWindows),
    centroid: mean(centroidWindows),
    flatness: mean(flatnessWindows),
    rolloff: mean(rolloffWindows),
    highFreqRatio: mean(highWindows),
    pitchHz: mean(pitches),
    pitchVariance: variance(pitches),
    voicedRatio: windows ? voiced / windows : 0,
    durationMs,
  };
}

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] ?? 0;
      const ti = im[i] ?? 0;
      re[i] = re[j] ?? 0;
      im[i] = im[j] ?? 0;
      re[j] = tr;
      im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const step = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k += 1) {
        const angle = step * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const evenR = re[i + k] ?? 0;
        const evenI = im[i + k] ?? 0;
        const oddR = re[i + k + half] ?? 0;
        const oddI = im[i + k + half] ?? 0;
        const tr = wr * oddR - wi * oddI;
        const ti = wr * oddI + wi * oddR;
        re[i + k] = evenR + tr;
        im[i + k] = evenI + ti;
        re[i + k + half] = evenR - tr;
        im[i + k + half] = evenI - ti;
      }
    }
  }
}

function spectralStats(spectrum: Float32Array, sampleRate: number, windowSize: number) {
  let magSum = 0;
  let weighted = 0;
  let logSum = 0;
  const nyquist = sampleRate / 2;
  const binHz = sampleRate / windowSize;

  for (let i = 1; i < spectrum.length; i += 1) {
    const mag = spectrum[i] ?? 0;
    magSum += mag;
    weighted += mag * i * binHz;
    logSum += Math.log(mag + 1e-9);
  }

  const centroid = magSum > 0 ? weighted / magSum : 0;
  const geo = Math.exp(logSum / Math.max(1, spectrum.length - 1));
  const arith = magSum / Math.max(1, spectrum.length - 1);
  const flatness = arith > 0 ? geo / arith : 0;

  let cum = 0;
  let rolloff = nyquist;
  const target = magSum * 0.85;
  for (let i = 1; i < spectrum.length; i += 1) {
    cum += spectrum[i] ?? 0;
    if (cum >= target) {
      rolloff = i * binHz;
      break;
    }
  }

  let high = 0;
  const highStart = Math.floor(spectrum.length * 0.55);
  for (let i = highStart; i < spectrum.length; i += 1) high += spectrum[i] ?? 0;
  const highRatio = magSum > 0 ? high / magSum : 0;

  return { centroid, flatness, rolloff, highRatio };
}

function estimatePitch(
  samples: Float32Array,
  start: number,
  windowSize: number,
  sampleRate: number,
): number {
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.floor(sampleRate / 60);
  let bestLag = 0;
  let best = 0;
  for (let lag = minLag; lag < maxLag && lag < windowSize / 2; lag += 2) {
    let sum = 0;
    for (let i = 0; i < windowSize - lag; i += 4) {
      sum += (samples[start + i] ?? 0) * (samples[start + i + lag] ?? 0);
    }
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  return bestLag ? sampleRate / bestLag : 0;
}

export function scoreFromFeatures(
  features: AcousticFeatures,
  context: ContextFlags,
  preset: ThresholdPreset,
): AnalysisResult {
  if (features.durationMs < 900 || features.rms < 0.008 || features.voicedRatio < 0.08) {
    return insufficientResult();
  }

  const acoustic = scoreAcoustic(features);
  const prosody = scoreProsody(features);
  const neural: LayerScore = {
    score: null,
    reasons: ["Neural anti-spoof unloaded on this laptop — fusion uses DSP + prosody"],
  };
  const contextLayer = scoreContext(context);

  const active = [
    { weight: LAYER_WEIGHTS.acoustic, value: acoustic.score ?? 0 },
    { weight: LAYER_WEIGHTS.prosody, value: prosody.score ?? 0 },
    { weight: LAYER_WEIGHTS.context, value: contextLayer.score ?? 0 },
  ];
  const weightSum = active.reduce((s, x) => s + x.weight, 0);
  const fused = active.reduce((s, x) => s + (x.weight / weightSum) * x.value, 0);
  const score = Math.round(clamp01(fused) * 100);
  const band = bandFromScore(score, preset);

  return {
    score,
    band,
    layers: { acoustic, prosody, neural, context: contextLayer },
    windowMs: Math.round(features.durationMs),
    retention: "features_only",
  };
}

function scoreAcoustic(features: AcousticFeatures): LayerScore {
  const reasons: string[] = [];
  let risk = 0.18;

  if (features.flatness > 0.45) {
    risk += 0.28;
    reasons.push("High spectral flatness — residual looks noise-like / vocoded");
  } else if (features.flatness < 0.08) {
    risk += 0.22;
    reasons.push("Unnaturally pure harmonic stack");
  }

  if (features.highFreqRatio < 0.06) {
    risk += 0.24;
    reasons.push("Vocoder-like high-frequency cutoff");
  } else if (features.highFreqRatio > 0.42) {
    risk += 0.08;
    reasons.push("Excess high-band energy vs natural speech");
  }

  if (features.rolloff < 2800) {
    risk += 0.16;
    reasons.push("Spectral rolloff unusually low for live speech");
  }

  if (features.centroid > 0 && features.centroid < 900) {
    risk += 0.1;
    reasons.push("Centroid clustered in a synthetic band");
  }

  if (features.rmsVariance < 0.00008) {
    risk += 0.12;
    reasons.push("Energy envelope too stable across windows");
  }

  if (!reasons.length) reasons.push("Spectral shape is consistent with a live human vocal tract");

  return { score: clamp01(risk), reasons: reasons.slice(0, 3) };
}

function scoreProsody(features: AcousticFeatures): LayerScore {
  const reasons: string[] = [];
  let risk = 0.16;

  if (features.pitchVariance < 40 && features.pitchHz > 0) {
    risk += 0.38;
    reasons.push("Unusually flat pitch contour");
  } else if (features.pitchVariance > 40) {
    reasons.push("Pitch micro-variation looks human");
  }

  if (features.rmsVariance < 0.00012) {
    risk += 0.18;
    reasons.push("Speaking energy lacks natural bursts and pauses");
  }

  if (features.zcr < 0.02 || features.zcr > 0.22) {
    risk += 0.12;
    reasons.push("Zero-crossing rate outside typical voiced speech");
  }

  if (features.voicedRatio > 0.92) {
    risk += 0.12;
    reasons.push("Almost no pause structure — TTS often fills every frame");
  }

  if (!reasons.length) reasons.push("Rhythm and pitch variance match natural speech");

  return { score: clamp01(risk), reasons: reasons.slice(0, 3) };
}

function scoreContext(context: ContextFlags): LayerScore {
  const reasons: string[] = [];
  let risk = 0.08;
  if (context.unknownNumber) {
    risk += 0.28;
    reasons.push("Caller ID is unknown / does not match a saved contact");
  }
  if (context.firstTimeCaller) {
    risk += 0.18;
    reasons.push("No prior genuine voiceprint for this caller");
  }
  if (context.urgencyLanguage) {
    risk += 0.32;
    reasons.push("Urgency language: send money / OTP / kisi ko mat batana");
  }
  if (!reasons.length) reasons.push("No social-engineering context flags raised");
  return { score: clamp01(risk), reasons };
}

export function bandFromScore(score: number, preset: ThresholdPreset): Band {
  const { review, high } = THRESHOLDS[preset];
  if (score >= high) return "high";
  if (score >= review) return "review";
  return "genuine";
}

export function reband(result: AnalysisResult, preset: ThresholdPreset): AnalysisResult {
  if (result.band === "insufficient") return result;
  return { ...result, band: bandFromScore(result.score, preset) };
}

export function insufficientResult(): AnalysisResult {
  return {
    score: 0,
    band: "insufficient",
    layers: {
      acoustic: { score: null, reasons: ["Not enough voiced audio to score"] },
      prosody: { score: null, reasons: ["Not enough voiced audio to score"] },
      neural: { score: null, reasons: ["Neural anti-spoof unloaded"] },
      context: { score: null, reasons: ["Context held until speech is present"] },
    },
    windowMs: 0,
    retention: "features_only",
  };
}

export function protectCopy(band: Band): { headline: string; hindi: string; body: string } {
  switch (band) {
    case "high":
      return {
        headline: "This voice may be AI-generated.",
        hindi: "यह आवाज़ AI से बनाई गई हो सकती है। पैसे न भेजें।",
        body: "Do not transfer money or share an OTP. Hang up and call them back on a number you already saved.",
      };
    case "review":
      return {
        headline: "Some synthetic patterns showed up.",
        hindi: "कुछ संकेत कृत्रिम आवाज़ जैसे हैं। पहले वापस कॉल करें।",
        body: "Pause before you send money. Call them back on a saved number, not the number that just rang.",
      };
    case "insufficient":
      return {
        headline: "We need a little more speech.",
        hindi: "थोड़ी और आवाज़ चाहिए।",
        body: "Keep the person talking for a few seconds, or upload a clearer clip. Silence is never scored as fake.",
      };
    default:
      return {
        headline: "This voice looks consistent with a human speaker.",
        hindi: "आवाज़ मानव जैसी लग रही है — फिर भी सतर्क रहें।",
        body: "Stay alert. A genuine voice can still be a scam if the story is urgent. Confirm on a saved number if money is involved.",
      };
  }
}
