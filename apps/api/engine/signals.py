"""Explainable acoustic signals for Stage 1.

Implements the seven signals in docs/ENGINE.md Section 3.2. Every signal returns a
value, a 0-1 suspicion, and a plain-English reason, because a score a judge cannot
interrogate is worth very little.

numpy + scipy only. F0 is our own autocorrelation tracker so we control latency and
can explain every step in a viva.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

import numpy as np

from .audio_io import frame_signal


@dataclass
class SignalReading:
    key: str
    label: str
    value: float | None
    unit: str
    suspicion: float | None
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PitchTrack:
    f0: np.ndarray          # Hz per frame, 0.0 where unvoiced
    voiced: np.ndarray      # bool per frame
    amplitude: np.ndarray   # RMS per frame
    frame_ms: float
    hop_ms: float

    @property
    def voiced_f0(self) -> np.ndarray:
        return self.f0[self.voiced]

    @property
    def voiced_count(self) -> int:
        return int(np.count_nonzero(self.voiced))


def _ramp_down(value: float, full: float, none: float) -> float:
    """1.0 at or below `full`, 0.0 at or above `none`, linear between.

    Used where a *low* measurement is the suspicious one (jitter, shimmer, monotone).
    """
    if none <= full:
        return 0.0
    if value <= full:
        return 1.0
    if value >= none:
        return 0.0
    return float((none - value) / (none - full))


def _ramp_up(value: float, none: float, full: float) -> float:
    """0.0 at or below `none`, 1.0 at or above `full`, linear between."""
    if full <= none:
        return 0.0
    if value <= none:
        return 0.0
    if value >= full:
        return 1.0
    return float((value - none) / (full - none))


def track_pitch(samples: np.ndarray, sample_rate: int, dsp: dict[str, Any]) -> PitchTrack:
    """Autocorrelation F0 tracker with parabolic peak interpolation.

    Sub-sample interpolation matters here: without it, F0 is quantised to integer
    lags and the jitter measurement collapses into that quantisation noise.
    """
    frame_ms = float(dsp.get("frame_ms", 40))
    hop_ms = float(dsp.get("hop_ms", 10))
    f0_min = float(dsp.get("f0_min_hz", 70))
    f0_max = float(dsp.get("f0_max_hz", 400))
    voicing_threshold = float(dsp.get("voicing_threshold", 0.35))

    frame_len = max(64, int(sample_rate * frame_ms / 1000.0))
    hop_len = max(1, int(sample_rate * hop_ms / 1000.0))
    frames = frame_signal(samples, frame_len, hop_len)
    if frames.shape[0] == 0:
        empty = np.zeros(0, dtype=np.float32)
        return PitchTrack(empty, np.zeros(0, dtype=bool), empty, frame_ms, hop_ms)

    amplitude = np.sqrt(np.mean(np.square(frames), axis=1)).astype(np.float32)

    centered = frames - frames.mean(axis=1, keepdims=True)
    window = np.hanning(frame_len).astype(np.float32)
    windowed = centered * window

    nfft = 1 << int(2 * frame_len - 1).bit_length()
    spectrum = np.fft.rfft(windowed, nfft, axis=1)
    autocorr = np.fft.irfft(spectrum * np.conj(spectrum), nfft, axis=1)[:, :frame_len]

    zero_lag = autocorr[:, 0:1].copy()
    zero_lag[zero_lag <= 0] = 1e-12
    normalized = autocorr / zero_lag

    min_lag = max(2, int(sample_rate / f0_max))
    max_lag = min(frame_len - 2, int(sample_rate / f0_min))
    if max_lag <= min_lag:
        empty = np.zeros(frames.shape[0], dtype=np.float32)
        return PitchTrack(empty, np.zeros(frames.shape[0], dtype=bool), amplitude, frame_ms, hop_ms)

    search = normalized[:, min_lag : max_lag + 1]
    best_offset = np.argmax(search, axis=1)
    best_value = search[np.arange(search.shape[0]), best_offset]
    best_lag = best_offset + min_lag

    # Parabolic interpolation around the integer peak.
    prev_lag = np.clip(best_lag - 1, 0, frame_len - 1)
    next_lag = np.clip(best_lag + 1, 0, frame_len - 1)
    rows = np.arange(normalized.shape[0])
    alpha = normalized[rows, prev_lag]
    beta = normalized[rows, best_lag]
    gamma = normalized[rows, next_lag]
    denom = alpha - 2.0 * beta + gamma
    shift = np.where(np.abs(denom) > 1e-12, 0.5 * (alpha - gamma) / np.where(np.abs(denom) > 1e-12, denom, 1.0), 0.0)
    shift = np.clip(shift, -0.5, 0.5)
    refined_lag = best_lag.astype(np.float64) + shift

    voiced = (best_value > voicing_threshold) & (refined_lag > 0)
    f0 = np.zeros(frames.shape[0], dtype=np.float32)
    safe = refined_lag.copy()
    safe[safe <= 0] = 1.0
    candidate = (sample_rate / safe).astype(np.float32)
    in_range = (candidate >= f0_min) & (candidate <= f0_max)
    voiced = voiced & in_range
    f0[voiced] = candidate[voiced]

    return PitchTrack(f0, voiced, amplitude, frame_ms, hop_ms)


def _pitch_stability(track: PitchTrack, min_frames: int) -> SignalReading:
    voiced_f0 = track.voiced_f0
    if voiced_f0.size < min_frames:
        return SignalReading(
            "pitch_stability", "Pitch variation", None, "Hz", None,
            "Not enough voiced speech to measure pitch variation.",
        )
    std = float(np.std(voiced_f0))
    suspicion = _ramp_down(std, full=8.0, none=25.0)
    if suspicion > 0.6:
        reason = (
            f"Pitch barely moves ({std:.1f} Hz spread). Human speech normally varies "
            "15-40 Hz across a sentence; synthetic speech is often flat."
        )
    elif suspicion > 0.25:
        reason = f"Pitch variation is on the low side ({std:.1f} Hz spread)."
    else:
        reason = f"Pitch moves naturally across the utterance ({std:.1f} Hz spread)."
    return SignalReading("pitch_stability", "Pitch variation", round(std, 2), "Hz", suspicion, reason)


def _jitter(track: PitchTrack, min_frames: int) -> SignalReading:
    """Frame-to-frame relative F0 perturbation, as a percentage.

    This is a frame-level proxy for clinical cycle-to-cycle jitter, not the same
    measurement. It is still discriminative because vocoders interpolate F0 into a
    smooth contour, whereas real vocal folds never track smoothly.
    """
    voiced_f0 = track.voiced_f0
    if voiced_f0.size < min_frames:
        return SignalReading(
            "jitter", "Vocal jitter", None, "%", None,
            "Not enough voiced speech to measure jitter.",
        )
    periods = 1.0 / np.maximum(voiced_f0, 1e-6)
    mean_period = float(np.mean(periods))
    if mean_period <= 0:
        return SignalReading("jitter", "Vocal jitter", None, "%", None, "Pitch track was unusable.")
    diffs = np.abs(np.diff(periods))
    jitter_pct = float(100.0 * np.mean(diffs) / mean_period) if diffs.size else 0.0
    suspicion = _ramp_down(jitter_pct, full=0.35, none=1.6)
    if suspicion > 0.6:
        reason = (
            f"Cycle-to-cycle pitch variation is only {jitter_pct:.2f}%, far below the human "
            "range. Real vocal folds are never this stable."
        )
    elif suspicion > 0.25:
        reason = f"Pitch is smoother than typical human speech ({jitter_pct:.2f}% jitter)."
    else:
        reason = f"Natural micro-instability in pitch ({jitter_pct:.2f}% jitter)."
    return SignalReading("jitter", "Vocal jitter", round(jitter_pct, 3), "%", suspicion, reason)


def _shimmer(track: PitchTrack, min_frames: int) -> SignalReading:
    voiced_amp = track.amplitude[track.voiced] if track.voiced.size else np.zeros(0)
    voiced_amp = voiced_amp[voiced_amp > 0]
    if voiced_amp.size < min_frames:
        return SignalReading(
            "shimmer", "Amplitude shimmer", None, "%", None,
            "Not enough voiced speech to measure shimmer.",
        )
    mean_amp = float(np.mean(voiced_amp))
    diffs = np.abs(np.diff(voiced_amp))
    shimmer_pct = float(100.0 * np.mean(diffs) / mean_amp) if diffs.size and mean_amp > 0 else 0.0
    suspicion = _ramp_down(shimmer_pct, full=1.5, none=6.0)
    if suspicion > 0.6:
        reason = (
            f"Loudness is unnaturally even ({shimmer_pct:.2f}% shimmer). Human breath "
            "support always fluctuates."
        )
    elif suspicion > 0.25:
        reason = f"Loudness is steadier than usual ({shimmer_pct:.2f}% shimmer)."
    else:
        reason = f"Loudness fluctuates naturally ({shimmer_pct:.2f}% shimmer)."
    return SignalReading("shimmer", "Amplitude shimmer", round(shimmer_pct, 3), "%", suspicion, reason)


def _find_gaps(track: PitchTrack) -> np.ndarray:
    """Durations in ms of inter-word silences, from the frame energy envelope."""
    amp = track.amplitude
    if amp.size < 10:
        return np.zeros(0)
    peak = float(np.percentile(amp, 95))
    floor = float(np.percentile(amp, 10))
    if peak <= 0:
        return np.zeros(0)
    threshold = max(peak * 0.12, floor * 2.0, 1e-5)
    silent = amp < threshold

    gaps: list[float] = []
    run = 0
    for index, is_silent in enumerate(silent):
        if is_silent:
            run += 1
            continue
        if run:
            # Only count interior gaps, not leading silence.
            duration = run * track.hop_ms
            if index - run > 0 and 120.0 <= duration <= 2000.0:
                gaps.append(duration)
            run = 0
    return np.asarray(gaps, dtype=np.float64)


def _pause_regularity(track: PitchTrack) -> SignalReading:
    gaps = _find_gaps(track)
    if gaps.size < 3:
        return SignalReading(
            "pause_regularity", "Pause rhythm", None, "ratio", None,
            "Too few pauses in this window to judge rhythm. Needs a longer sample.",
        )
    mean_gap = float(np.mean(gaps))
    if mean_gap <= 0:
        return SignalReading("pause_regularity", "Pause rhythm", None, "ratio", None, "Pause measurement failed.")
    cv = float(np.std(gaps) / mean_gap)
    suspicion = _ramp_down(cv, full=0.25, none=0.70)
    if suspicion > 0.6:
        reason = (
            f"Gaps between words are almost identical in length (variation {cv:.2f}). "
            "Synthetic speech places pauses on a grid; people do not."
        )
    elif suspicion > 0.25:
        reason = f"Pause lengths are more even than usual (variation {cv:.2f})."
    else:
        reason = f"Pauses vary naturally in length (variation {cv:.2f})."
    return SignalReading("pause_regularity", "Pause rhythm", round(cv, 3), "ratio", suspicion, reason)


def _mean_spectrum(samples: np.ndarray, sample_rate: int) -> tuple[np.ndarray, np.ndarray]:
    frame_len = 1024 if samples.size >= 1024 else max(256, samples.size)
    frames = frame_signal(samples, frame_len, frame_len // 2)
    if frames.shape[0] == 0:
        return np.zeros(0), np.zeros(0)
    window = np.hanning(frame_len).astype(np.float32)
    spectra = np.abs(np.fft.rfft(frames * window, axis=1))
    # Energy-weighted: silent frames should not dominate the average spectrum.
    energies = np.sqrt(np.mean(np.square(frames), axis=1))
    if np.any(energies > 0):
        keep = energies > max(float(np.percentile(energies, 60)), 1e-6)
        if np.any(keep):
            spectra = spectra[keep]
    mean_mag = spectra.mean(axis=0)
    freqs = np.fft.rfftfreq(frame_len, 1.0 / sample_rate)
    return mean_mag, freqs


def _hf_cutoff(samples: np.ndarray, sample_rate: int) -> SignalReading:
    """Highest frequency still carrying meaningful energy.

    Neural vocoders synthesise up to a fixed ceiling and leave a brick wall above it.
    Caveat: real telephone audio is band-limited to ~3.4 kHz too, so a low cutoff is
    only suspicious when the capture path could have carried more.
    """
    mean_mag, freqs = _mean_spectrum(samples, sample_rate)
    if mean_mag.size == 0:
        return SignalReading("hf_cutoff", "High-frequency ceiling", None, "Hz", None, "Spectrum unavailable.")
    nyquist = sample_rate / 2.0
    magnitude_db = 20.0 * np.log10(np.maximum(mean_mag, 1e-12))
    peak_db = float(np.max(magnitude_db))
    threshold_db = peak_db - 50.0
    above = np.where(magnitude_db > threshold_db)[0]
    if above.size == 0:
        return SignalReading("hf_cutoff", "High-frequency ceiling", None, "Hz", None, "Spectrum unavailable.")
    cutoff = float(freqs[above[-1]])

    # Only meaningful if the capture path could have carried more than the cutoff.
    if nyquist < 7800.0:
        reason = (
            f"Energy stops at {cutoff / 1000:.1f} kHz, but this recording is limited to "
            f"{nyquist / 1000:.1f} kHz anyway, so no conclusion is drawn from it."
        )
        return SignalReading("hf_cutoff", "High-frequency ceiling", round(cutoff, 1), "Hz", None, reason)

    suspicion = _ramp_down(cutoff, full=5000.0, none=7600.0)
    if suspicion > 0.6:
        reason = (
            f"Sharp cut-off at {cutoff / 1000:.1f} kHz with headroom to "
            f"{nyquist / 1000:.1f} kHz. Neural vocoders leave exactly this kind of ceiling."
        )
    elif suspicion > 0.25:
        reason = f"High frequencies fade early, at about {cutoff / 1000:.1f} kHz."
    else:
        reason = f"Full-band energy up to {cutoff / 1000:.1f} kHz, consistent with a real microphone."
    return SignalReading("hf_cutoff", "High-frequency ceiling", round(cutoff, 1), "Hz", suspicion, reason)


def _spectral_flatness(samples: np.ndarray, sample_rate: int) -> SignalReading:
    mean_mag, _ = _mean_spectrum(samples, sample_rate)
    if mean_mag.size == 0:
        return SignalReading("spectral_flatness", "Spectral flatness", None, "ratio", None, "Spectrum unavailable.")
    power = np.square(np.maximum(mean_mag, 1e-12))
    geometric = float(np.exp(np.mean(np.log(power))))
    arithmetic = float(np.mean(power))
    if arithmetic <= 0:
        return SignalReading("spectral_flatness", "Spectral flatness", None, "ratio", None, "Spectrum unavailable.")
    flatness = geometric / arithmetic

    # Suspicious at both ends: noise-like residual, or over-smoothed synthesis.
    high_side = _ramp_up(flatness, none=0.35, full=0.55)
    low_side = _ramp_down(flatness, full=0.010, none=0.030)
    suspicion = max(high_side, low_side)
    if high_side > 0.5:
        reason = f"Spectrum is unusually noise-like (flatness {flatness:.3f}), a common vocoder residual."
    elif low_side > 0.5:
        reason = f"Spectrum is unusually smooth (flatness {flatness:.3f}), suggesting over-processed synthesis."
    else:
        reason = f"Spectral shape looks like natural speech (flatness {flatness:.3f})."
    return SignalReading(
        "spectral_flatness", "Spectral flatness", round(flatness, 4), "ratio", suspicion, reason
    )


def _breath(samples: np.ndarray, sample_rate: int, track: PitchTrack) -> SignalReading:
    """Count breath-like events: unvoiced, quiet but above the floor, broadband.

    Most TTS omits inhalation entirely. Needs a reasonably long window to be fair,
    since a 3-second clip may legitimately contain no breath.
    """
    duration_s = samples.size / sample_rate if sample_rate else 0.0
    if duration_s < 4.0:
        return SignalReading(
            "breath", "Breath sounds", None, "count/10s", None,
            "Window is too short to expect a breath. Needs at least 4 seconds.",
        )
    frame_len = max(64, int(0.02 * sample_rate))
    frames = frame_signal(samples, frame_len, frame_len)
    if frames.shape[0] == 0:
        return SignalReading("breath", "Breath sounds", None, "count/10s", None, "Audio too short.")

    energies = np.sqrt(np.mean(np.square(frames), axis=1))
    signs = np.signbit(frames)
    zcr = np.mean(np.diff(signs, axis=1), axis=1)
    zcr = np.abs(zcr)

    peak = float(np.percentile(energies, 95))
    floor = float(np.percentile(energies, 10))
    if peak <= 0:
        return SignalReading("breath", "Breath sounds", None, "count/10s", None, "Audio is silent.")

    breathy = (
        (energies > max(floor * 1.4, peak * 0.02))
        & (energies < peak * 0.28)
        & (zcr > 0.14)
    )

    events = 0
    run = 0
    min_frames = max(1, int(0.12 / 0.02))
    for flag in breathy:
        if flag:
            run += 1
        else:
            if run >= min_frames:
                events += 1
            run = 0
    if run >= min_frames:
        events += 1

    per_10s = float(events * 10.0 / duration_s)
    suspicion = _ramp_down(per_10s, full=0.2, none=1.8)
    if suspicion > 0.6:
        reason = (
            f"No audible breathing across {duration_s:.1f} seconds of speech. People inhale "
            "between clauses; most synthetic voices never do."
        )
    elif suspicion > 0.25:
        reason = f"Very little audible breathing ({per_10s:.1f} per 10 s)."
    else:
        reason = f"Audible breathing present ({per_10s:.1f} per 10 s)."
    return SignalReading("breath", "Breath sounds", round(per_10s, 2), "count/10s", suspicion, reason)


def disfluency_signal(
    transcript: str | None,
    marker_count: int,
    word_count: int,
    min_words: int,
) -> SignalReading:
    """Absence of hesitation markers. Corroborating evidence only.

    A human reading from a script has no disfluencies either, which is why this can
    never be the sole basis for a high band.
    """
    if transcript is None:
        return SignalReading(
            "disfluency", "Hesitation markers", None, "count", None,
            "No transcript available, so hesitation could not be checked.",
        )
    if word_count < min_words:
        return SignalReading(
            "disfluency", "Hesitation markers", float(marker_count), "count", None,
            f"Only {word_count} words transcribed; need {min_words} before judging hesitation.",
        )
    rate = 100.0 * marker_count / max(1, word_count)
    suspicion = _ramp_down(rate, full=0.05, none=2.5)
    if marker_count == 0:
        reason = (
            f"No hesitation sounds in {word_count} words. Natural conversation usually "
            "contains 'um' or 'uh'; scripted synthetic speech does not."
        )
    elif suspicion > 0.4:
        reason = f"Very few hesitation sounds ({marker_count} in {word_count} words)."
    else:
        reason = f"Natural hesitation present ({marker_count} in {word_count} words)."
    return SignalReading("disfluency", "Hesitation markers", float(marker_count), "count", suspicion, reason)


def extract_signals(
    samples: np.ndarray,
    sample_rate: int,
    dsp: dict[str, Any],
    spectral_samples: np.ndarray | None = None,
    spectral_rate: int | None = None,
) -> tuple[list[SignalReading], PitchTrack]:
    """Compute the seven acoustic signals.

    `spectral_samples` lets the caller pass audio at its original (higher) sample
    rate. That matters for the high-frequency ceiling: resampling to 16 kHz caps
    analysis at 8 kHz and would hide a vocoder ceiling sitting above it.
    """
    min_frames = int(dsp.get("min_voiced_frames", 12))
    track = track_pitch(samples, sample_rate, dsp)

    spec_audio = spectral_samples if spectral_samples is not None and spectral_samples.size else samples
    spec_rate = spectral_rate if spectral_samples is not None and spectral_samples.size else sample_rate

    readings = [
        _pitch_stability(track, min_frames),
        _jitter(track, min_frames),
        _shimmer(track, min_frames),
        _pause_regularity(track),
        _hf_cutoff(spec_audio, spec_rate),
        _spectral_flatness(spec_audio, spec_rate),
        _breath(samples, sample_rate, track),
    ]
    return readings, track


def weighted_suspicion(
    readings: list[SignalReading],
    weights: dict[str, float],
) -> tuple[float | None, list[str]]:
    """Weighted mean over signals that produced a value, renormalized.

    Signals that could not be computed are excluded rather than defaulted, so a
    short or noisy window degrades gracefully instead of inventing a number.
    """
    total_weight = 0.0
    accumulated = 0.0
    skipped: list[str] = []
    for reading in readings:
        if reading.suspicion is None:
            skipped.append(reading.key)
            continue
        weight = float(weights.get(reading.key, 0.0))
        if weight <= 0:
            continue
        total_weight += weight
        accumulated += weight * float(reading.suspicion)
    if total_weight <= 0:
        return None, skipped
    return accumulated / total_weight, skipped
