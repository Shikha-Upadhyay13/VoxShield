"""Self-test: prove the engine runs end to end without needing any recordings.

This checks wiring and sanity, not accuracy. Real accuracy comes from calibrate.py on
actual clips. See docs/ENGINE.md Section 8.

Usage:
    python selftest.py                      # DSP + fraud (no model downloads)
    VOXSHIELD_PROFILE=full python selftest.py
"""

from __future__ import annotations

import sys

import numpy as np

from engine import fusion
from engine.audio_io import check_sufficiency, decode_native, pcm16_to_float, resample_to
from engine.config import SAMPLE_RATE, enable_utf8_console, settings
from engine.lexicon import count_disfluencies, extract_amount, score_lexicon
from engine.signals import extract_signals, track_pitch

RATE = 24000


def human_like(seconds: float = 6.0) -> np.ndarray:
    """Irregular pitch, jitter, breath noise, uneven pauses."""
    rng = np.random.default_rng(7)
    t = np.arange(int(seconds * RATE)) / RATE
    # Wandering f0 with vibrato and per-cycle noise.
    f0 = 150 + 18 * np.sin(2 * np.pi * 0.7 * t) + 6 * np.sin(2 * np.pi * 4.3 * t)
    f0 += rng.normal(0, 2.5, t.size)
    phase = 2 * np.pi * np.cumsum(f0) / RATE
    signal = np.sin(phase)
    for harmonic, gain in ((2, 0.4), (3, 0.22), (4, 0.12), (5, 0.06)):
        signal += gain * np.sin(harmonic * phase + rng.normal(0, 0.4))
    # Uneven amplitude envelope and irregular pauses.
    envelope = 0.5 + 0.5 * np.sin(2 * np.pi * 0.45 * t + 0.6)
    envelope *= 1 + rng.normal(0, 0.09, t.size)
    gaps = ((0.9, 0.31), (2.15, 0.18), (3.4, 0.44), (4.8, 0.22))
    for start, length in gaps:
        a, b = int(start * RATE), int((start + length) * RATE)
        envelope[a:b] *= 0.03
    signal *= envelope
    # Breath goes in after the envelope, not before. Adding it first would let the
    # envelope's 0.03 gap multiplier scale the inhalation down below the noise floor,
    # so the detector would correctly report no breath and the test would be measuring
    # the wrong thing.
    for start, length in gaps:
        a, b = int(start * RATE), int((start + length) * RATE)
        signal[a:b] += rng.normal(0, 0.035, max(0, b - a))
    signal += rng.normal(0, 0.004, t.size)
    return (0.55 * signal / np.max(np.abs(signal))).astype(np.float32)


def clone_like(seconds: float = 6.0) -> np.ndarray:
    """Fixed f0, clean harmonic stack, metronomic pauses, hard 6 kHz ceiling."""
    t = np.arange(int(seconds * RATE)) / RATE
    f0 = 168.0
    phase = 2 * np.pi * f0 * t
    signal = np.sin(phase)
    for harmonic, gain in ((2, 0.45), (3, 0.3), (4, 0.2), (5, 0.13), (6, 0.08)):
        signal += gain * np.sin(harmonic * phase)
    # Pauses on a strict grid.
    envelope = np.ones_like(t)
    for index in range(1, int(seconds / 0.62)):
        start = index * 0.62
        a, b = int(start * RATE), int((start + 0.16) * RATE)
        envelope[a:b] *= 0.02
    signal *= envelope
    # Brick-wall low-pass to imitate a vocoder ceiling.
    from scipy.signal import butter, sosfiltfilt

    sos = butter(10, 6000, btype="low", fs=RATE, output="sos")
    signal = sosfiltfilt(sos, signal)
    return (0.55 * signal / np.max(np.abs(signal))).astype(np.float32)


SCAM_SCRIPT = (
    "Beta main police station mein hoon, ek case ho gaya hai. "
    "Turant 50 hazaar transfer karo aur OTP batao. Kisi ko mat batana."
)
BENIGN_SCRIPT = "Hi ma, I reached the hostel. Will call you after dinner tonight, okay?"


def check(name: str, passed: bool, detail: str = "") -> bool:
    print(f"  [{'PASS' if passed else 'FAIL'}] {name}{f' — {detail}' if detail else ''}")
    return passed


def main() -> int:
    enable_utf8_console()
    print(f"VoxShield self-test\n  profile: {settings.profile}\n")
    results: list[bool] = []

    # --- Audio plumbing ---------------------------------------------------------
    print("Audio plumbing:")
    human = human_like()
    clone = clone_like()
    results.append(check("synthesised test signals", human.size > 0 and clone.size > 0))

    resampled = resample_to(human, RATE, SAMPLE_RATE)
    results.append(
        check(
            "resample 24k -> 16k",
            abs(resampled.size - human.size * SAMPLE_RATE / RATE) < 50,
            f"{human.size} -> {resampled.size}",
        )
    )

    pcm = (np.clip(human[:1000], -1, 1) * 32767).astype("<i2").tobytes()
    restored = pcm16_to_float(pcm)
    results.append(
        check("PCM16 round-trip", restored.size == 1000 and np.max(np.abs(restored)) <= 1.0)
    )

    gate = check_sufficiency(resampled, SAMPLE_RATE, settings.gate)
    results.append(check("sufficiency gate accepts speech", gate.ok, gate.reason or "ok"))

    silence = np.zeros(SAMPLE_RATE * 3, dtype=np.float32)
    silent_gate = check_sufficiency(silence, SAMPLE_RATE, settings.gate)
    results.append(check("sufficiency gate rejects silence", not silent_gate.ok, silent_gate.reason))

    # --- DSP signals ------------------------------------------------------------
    print("\nDSP signals:")
    human16 = resample_to(human, RATE, SAMPLE_RATE)
    clone16 = resample_to(clone, RATE, SAMPLE_RATE)

    human_track = track_pitch(human16, SAMPLE_RATE, settings.dsp)
    results.append(
        check(
            "pitch tracker finds voiced frames",
            human_track.voiced_count > 50,
            f"{human_track.voiced_count} voiced frames",
        )
    )

    human_signals, _ = extract_signals(human16, SAMPLE_RATE, settings.dsp, human, RATE)
    clone_signals, _ = extract_signals(clone16, SAMPLE_RATE, settings.dsp, clone, RATE)

    print("\n  signal              human   clone   direction")
    print("  " + "-" * 48)
    directional = 0
    comparable = 0
    for h, c in zip(human_signals, clone_signals):
        if h.suspicion is None or c.suspicion is None:
            print(f"  {h.key:<18} {'--':>7} {'--':>7}   not measured")
            continue
        comparable += 1
        arrow = "ok" if c.suspicion > h.suspicion else "wrong way" if c.suspicion < h.suspicion else "flat"
        if c.suspicion > h.suspicion:
            directional += 1
        print(f"  {h.key:<18} {h.suspicion:>7.3f} {c.suspicion:>7.3f}   {arrow}")

    results.append(
        check(
            "most signals point the right way on reference tones",
            comparable > 0 and directional >= max(1, comparable // 2),
            f"{directional}/{comparable} correct",
        )
    )

    # --- Fraud layer ------------------------------------------------------------
    print("\nFraud layer:")
    scam = score_lexicon(SCAM_SCRIPT)
    benign = score_lexicon(BENIGN_SCRIPT)
    results.append(
        check(
            "scam script scores above benign",
            scam.score > benign.score,
            f"{scam.score:.3f} vs {benign.score:.3f}",
        )
    )
    results.append(
        check(
            "scam categories detected",
            {"credentials", "coercion", "secrecy"}.issubset(set(scam.categories)),
            ", ".join(scam.categories),
        )
    )

    amount = extract_amount(SCAM_SCRIPT)
    results.append(
        check(
            "amount extraction reads '50 hazaar' as 50000",
            amount.amount_inr == 50000,
            f"{amount.amount_inr} from '{amount.raw}'",
        )
    )
    for text, expected in (("2 lakh", 200000), ("₹10,000", 10000), ("1.5 crore", 15000000)):
        got = extract_amount(f"send {text} now").amount_inr
        results.append(check(f"amount '{text}'", got == expected, f"got {got}"))

    markers, words = count_disfluencies("umm main matlab woh haan theek hai")
    results.append(check("disfluency counting", markers >= 3 and words == 7, f"{markers} in {words}"))

    # --- Neural detectors -------------------------------------------------------
    if settings.profile != "dsp_only":
        print("\nNeural detectors:")
        from engine import stage1_neural

        stage1_neural.warmup()
        status = stage1_neural.model_status()
        for key, loaded in status.items():
            results.append(check(f"{key} loaded", loaded))
        for note in stage1_neural.label_notes():
            print(f"  note: {note}")

        human_neural = stage1_neural.score_audio(human16, SAMPLE_RATE)
        clone_neural = stage1_neural.score_audio(clone16, SAMPLE_RATE)
        for key in sorted(set(human_neural.scores) | set(clone_neural.scores)):
            h = human_neural.scores.get(key)
            c = clone_neural.scores.get(key)
            print(
                f"  {key:<12} human={h if h is None else f'{h:.3f}'}"
                f"  clone={c if c is None else f'{c:.3f}'}"
            )
        # Not asserted. These are synthesised tones, not speech, and a detector trained
        # on real speech has every right to be confused by them. What matters is that
        # the models produce a number at all; polarity is verified on real clips by
        # calibrate.py.
        print(
            "  Polarity on real audio is NOT verified here. Run calibrate.py against\n"
            "  demo/audio/real and demo/audio/clone before trusting these scores."
        )

    # --- Full pipeline ----------------------------------------------------------
    print("\nFull pipeline:")
    human_result = fusion.analyze(human16, SAMPLE_RATE, spectral_samples=human, spectral_rate=RATE)
    clone_result = fusion.analyze(clone16, SAMPLE_RATE, spectral_samples=clone, spectral_rate=RATE)

    results.append(check("human reference scored", human_result.status == "ok", fusion.summarize(human_result) if human_result.status == "ok" else human_result.reason))
    results.append(check("clone reference scored", clone_result.status == "ok", fusion.summarize(clone_result) if clone_result.status == "ok" else clone_result.reason))

    if human_result.status == "ok" and clone_result.status == "ok":
        gap = clone_result.authenticity.score - human_result.authenticity.score
        results.append(
            check(
                "clone reference scores above human reference",
                gap > 0,
                f"{human_result.authenticity.score} vs {clone_result.authenticity.score} (gap {gap:+d})",
            )
        )
        results.append(
            check(
                "payload serialises",
                isinstance(clone_result.model_dump(), dict),
                f"{len(clone_result.authenticity.signals)} signals",
            )
        )

    silent_result = fusion.analyze(silence, SAMPLE_RATE)
    results.append(
        check("silence returns insufficient_audio", silent_result.status == "insufficient_audio")
    )

    # --- Action matrix ----------------------------------------------------------
    print("\nAction matrix:")
    auth = settings.thresholds("standard", "authenticity")
    fraud_t = settings.thresholds("standard", "fraud")
    cases = [
        (90, 90, "critical"),
        (10, 90, "fraud_human"),
        (90, 5, "synthetic_benign"),
        (50, 5, "review"),
        (5, 5, "clear"),
    ]
    for a, f, expected in cases:
        got = fusion.decide_verdict(a, f, auth, fraud_t)
        results.append(check(f"auth={a} fraud={f} -> {expected}", got == expected, f"got {got}"))

    passed = sum(1 for r in results if r)
    print(f"\n{passed}/{len(results)} checks passed")
    if passed != len(results):
        print(
            "\nThis is a wiring test on synthetic tones. It does not measure accuracy on real\n"
            "voices. Run calibrate.py against demo/audio/ for that."
        )
        return 1
    print(
        "\nWiring is sound. This says nothing about accuracy on real voices — run\n"
        "calibrate.py against your own recordings for the number worth quoting."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
