"""Audio decoding, resampling, and the sufficiency gate.

No ffmpeg binary is required. soundfile handles wav/flac/ogg; PyAV handles the
webm/opus the browser's MediaRecorder produces, plus mp3 and m4a.
See docs/ENGINE.md Section 6.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass
from fractions import Fraction

import numpy as np
from scipy.signal import resample_poly

from .config import MAX_UPLOAD_S, SAMPLE_RATE


class DecodeError(RuntimeError):
    """Raised when no available decoder can read the payload."""


@dataclass
class GateResult:
    ok: bool
    reason: str
    duration_ms: int
    rms: float
    voiced_ratio: float


def to_mono(samples: np.ndarray) -> np.ndarray:
    if samples.ndim == 1:
        return samples.astype(np.float32, copy=False)
    # soundfile gives (frames, channels); PyAV gives (channels, frames).
    axis = 1 if samples.shape[0] >= samples.shape[1] else 0
    return samples.mean(axis=axis).astype(np.float32, copy=False)


def resample_to(samples: np.ndarray, source_rate: int, target_rate: int = SAMPLE_RATE) -> np.ndarray:
    if source_rate == target_rate or samples.size == 0:
        return samples.astype(np.float32, copy=False)
    ratio = Fraction(target_rate, source_rate).limit_denominator(1000)
    resampled = resample_poly(samples, ratio.numerator, ratio.denominator)
    return np.asarray(resampled, dtype=np.float32)


def _decode_soundfile(payload: bytes) -> tuple[np.ndarray, int]:
    import soundfile as sf

    with sf.SoundFile(io.BytesIO(payload)) as handle:
        data = handle.read(dtype="float32", always_2d=False)
        return np.asarray(data), int(handle.samplerate)


def _decode_pyav(payload: bytes) -> tuple[np.ndarray, int]:
    import av

    with av.open(io.BytesIO(payload)) as container:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise DecodeError("No audio stream in container.")
        source_rate = int(stream.rate or SAMPLE_RATE)
        chunks: list[np.ndarray] = []
        for frame in container.decode(stream):
            chunks.append(to_mono(frame.to_ndarray()))
        if not chunks:
            raise DecodeError("Audio stream decoded to zero frames.")
        return np.concatenate(chunks), source_rate


def decode_native(payload: bytes) -> tuple[np.ndarray, int]:
    """Decode audio bytes to mono float32 at the file's own sample rate.

    Kept at native rate on purpose: the high-frequency ceiling signal needs headroom
    above 8 kHz to be meaningful, and resampling to 16 kHz would throw that evidence
    away before we ever look at it.
    """
    errors: list[str] = []
    for decoder in (_decode_soundfile, _decode_pyav):
        try:
            raw, source_rate = decoder(payload)
        except Exception as exc:  # noqa: BLE001 - we genuinely want to try the next decoder
            errors.append(f"{decoder.__name__}: {exc}")
            continue
        mono = to_mono(np.asarray(raw))
        if mono.size == 0:
            errors.append(f"{decoder.__name__}: empty result")
            continue
        peak = float(np.max(np.abs(mono))) if mono.size else 0.0
        if peak > 1.0:
            mono = mono / peak
        limit = int(MAX_UPLOAD_S * source_rate)
        return mono[:limit].astype(np.float32, copy=False), int(source_rate)
    raise DecodeError("Could not decode audio. Tried: " + "; ".join(errors))


def decode_audio(payload: bytes, target_rate: int = SAMPLE_RATE) -> tuple[np.ndarray, int]:
    """Decode arbitrary audio bytes to `target_rate` mono float32 in -1.0..1.0."""
    mono, source_rate = decode_native(payload)
    if target_rate <= 0:
        return mono, source_rate
    samples = resample_to(mono, source_rate, target_rate)
    return samples[: int(MAX_UPLOAD_S * target_rate)], target_rate


def pcm16_to_float(payload: bytes) -> np.ndarray:
    """Convert raw little-endian PCM16 bytes (as sent over the WebSocket) to float32."""
    if len(payload) % 2:
        payload = payload[:-1]
    ints = np.frombuffer(payload, dtype="<i2")
    return (ints.astype(np.float32) / 32768.0).copy()


def frame_signal(samples: np.ndarray, frame_len: int, hop_len: int) -> np.ndarray:
    """Split into overlapping frames as a (num_frames, frame_len) view."""
    if samples.size < frame_len:
        return np.empty((0, frame_len), dtype=np.float32)
    num_frames = 1 + (samples.size - frame_len) // hop_len
    indices = np.arange(frame_len)[None, :] + hop_len * np.arange(num_frames)[:, None]
    return samples[indices]


def voiced_ratio(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> float:
    """Fraction of frames whose energy is meaningfully above the noise floor.

    Deliberately cheap: this only feeds the sufficiency gate. Real voicing
    detection happens in signals.py via autocorrelation.
    """
    frame_len = max(1, int(0.02 * sample_rate))
    frames = frame_signal(samples, frame_len, frame_len)
    if frames.shape[0] == 0:
        return 0.0
    energies = np.sqrt(np.mean(np.square(frames), axis=1))
    if not np.any(energies):
        return 0.0
    floor = float(np.percentile(energies, 10))
    peak = float(np.percentile(energies, 95))
    if peak <= 0:
        return 0.0
    threshold = max(floor * 2.5, peak * 0.15, 1e-4)
    return float(np.mean(energies > threshold))


def check_sufficiency(
    samples: np.ndarray,
    sample_rate: int,
    gate: dict[str, float],
) -> GateResult:
    """Decide whether there is enough voiced speech to score at all.

    Returning a confident number on silence is the fastest way to lose a judge's
    trust, so this gate is a hard stop rather than a warning.
    """
    duration_ms = int(1000 * samples.size / sample_rate) if sample_rate else 0
    rms = float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0
    if math.isnan(rms):
        rms = 0.0
    ratio = voiced_ratio(samples, sample_rate)

    min_duration = float(gate.get("min_duration_ms", 1000))
    min_rms = float(gate.get("min_rms", 0.008))
    min_voiced = float(gate.get("min_voiced_ratio", 0.08))

    if duration_ms < min_duration:
        reason = f"Need at least {min_duration / 1000:.1f} seconds of audio."
    elif rms < min_rms:
        reason = "Audio is too quiet to analyse."
    elif ratio < min_voiced:
        reason = "No speech detected in this audio."
    else:
        return GateResult(True, "", duration_ms, rms, ratio)

    return GateResult(False, reason, duration_ms, rms, ratio)


def last_seconds(samples: np.ndarray, sample_rate: int, seconds: float) -> np.ndarray:
    want = int(seconds * sample_rate)
    if samples.size <= want:
        return samples
    return samples[-want:]
