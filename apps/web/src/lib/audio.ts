export function floatToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const out = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  for (let c = 0; c < channels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      out[i] += (data[i] ?? 0) / channels;
    }
  }
  return out;
}

export function downsample(input: Float32Array, fromRate: number, toRate = 16000): {
  samples: Float32Array;
  sampleRate: number;
} {
  if (fromRate === toRate) return { samples: input, sampleRate: fromRate };
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const frac = src - i0;
    const a = input[i0] ?? 0;
    const b = input[i0 + 1] ?? a;
    samples[i] = a + (b - a) * frac;
  }
  return { samples, sampleRate: toRate };
}

export async function decodeFile(file: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  const raw = await file.arrayBuffer();
  const buffer = await ctx.decodeAudioData(raw.slice(0));
  await ctx.close();
  return buffer;
}

export function synthesizeHumanLike(sampleRate = 16000, seconds = 4.2): AudioBuffer {
  const ctx = new OfflineAudioContext(1, Math.floor(sampleRate * seconds), sampleRate);
  const data = ctx.createBuffer(1, ctx.length, sampleRate);
  const out = data.getChannelData(0);
  for (let i = 0; i < out.length; i += 1) {
    const t = i / sampleRate;
    const burst = Math.max(0, Math.sin(t * 2.4) ** 2);
    const pause = burst < 0.12 ? 0 : 1;
    const f0 = 148 + 18 * Math.sin(t * 5.1) + 11 * Math.sin(t * 13.7) + 7 * Math.sin(t * 0.7);
    const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5.4 * t);
    let s = 0;
    for (let h = 1; h <= 6; h += 1) {
      s += (1 / h) * Math.sin(2 * Math.PI * f0 * vibrato * h * t);
    }
    const noise = (Math.random() * 2 - 1) * 0.08;
    const breath = (Math.random() * 2 - 1) * 0.03 * (1 - burst);
    out[i] = (s * 0.18 + noise + breath) * pause * (0.7 + 0.3 * burst);
  }
  return data;
}

export function synthesizeCloneLike(sampleRate = 16000, seconds = 4.2): AudioBuffer {
  const ctx = new OfflineAudioContext(1, Math.floor(sampleRate * seconds), sampleRate);
  const data = ctx.createBuffer(1, ctx.length, sampleRate);
  const out = data.getChannelData(0);
  const f0 = 168;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / sampleRate;
    let s = 0;
    for (let h = 1; h <= 12; h += 1) {
      s += (1 / (h * 0.85)) * Math.sin(2 * Math.PI * f0 * h * t);
    }
    const gated = t % 0.42 < 0.4 ? 1 : 0.02;
    const cutoff = Math.sin(2 * Math.PI * 7000 * t) * 0.01;
    out[i] = (s * 0.09 + cutoff) * gated;
  }
  // Brick-wall feel: strip high variation by a cheap moving average
  let acc = 0;
  for (let i = 0; i < out.length; i += 1) {
    acc = acc * 0.72 + (out[i] ?? 0) * 0.28;
    out[i] = acc;
  }
  return data;
}

export function bufferToWavBlob(buffer: AudioBuffer): Blob {
  const samples = floatToMono(buffer);
  const rate = buffer.sampleRate;
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([bytes], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}
