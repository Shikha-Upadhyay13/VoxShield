"""Lightweight DSP voiceprint match — not ECAPA.

Compares a small feature card (pitch, pitch_std, centroid, flatness) between an
enrolled print and the live window. Honest for SIH cross-session demos; do not
claim neural speaker verification.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from .schemas import IdentityOut
from .signals import PitchTrack, SignalReading

METHOD = "dsp_features_v1"
FEATURE_KEYS = ("pitch", "pitch_std", "centroid", "flatness")

# Typical scales so distance is dimensionless-ish.
_SCALES = {
    "pitch": 80.0,       # Hz
    "pitch_std": 25.0,   # Hz
    "centroid": 1500.0,  # Hz
    "flatness": 0.15,    # ratio
}


def live_features(
    track: PitchTrack,
    readings: list[SignalReading],
) -> dict[str, float]:
    """Build a feature card from the current analysis window."""
    out: dict[str, float] = {}
    voiced = track.voiced_f0
    if voiced.size >= 4:
        out["pitch"] = float(np.mean(voiced))
        out["pitch_std"] = float(np.std(voiced))
    by_key = {r.key: r.value for r in readings if r.value is not None}
    if "spectral_flatness" in by_key:
        out["flatness"] = float(by_key["spectral_flatness"])
    # HF ceiling is a rough stand-in for spectral centre of mass when MFCC isn't exposed.
    if "hf_cutoff" in by_key:
        out["centroid"] = float(by_key["hf_cutoff"]) * 0.45
    return out


def normalize_enrollment(raw: dict[str, Any] | None) -> dict[str, float] | None:
    if not raw or not isinstance(raw, dict):
        return None
    cleaned: dict[str, float] = {}
    for key in FEATURE_KEYS:
        value = raw.get(key)
        if value is None and key == "pitch":
            value = raw.get("pitchHz") or raw.get("pitch_hz")
        if value is None and key == "pitch_std":
            variance = raw.get("pitchVariance") or raw.get("pitch_variance")
            if variance is not None:
                try:
                    value = float(variance) ** 0.5
                except (TypeError, ValueError):
                    value = None
        if value is None:
            continue
        try:
            cleaned[key] = float(value)
        except (TypeError, ValueError):
            continue
    return cleaned or None


def compare(
    enrolled: dict[str, float] | None,
    live: dict[str, float] | None,
) -> IdentityOut:
    if not enrolled:
        return IdentityOut(
            enrolled=False,
            match_score=None,
            mismatch=None,
            method=METHOD,
            note="No enrollment features supplied.",
        )
    if not live or len(live) < 2:
        return IdentityOut(
            enrolled=True,
            match_score=None,
            mismatch=None,
            method=METHOD,
            note="Not enough live features to compare yet.",
        )

    keys = [k for k in FEATURE_KEYS if k in enrolled and k in live]
    if len(keys) < 2:
        return IdentityOut(
            enrolled=True,
            match_score=None,
            mismatch=None,
            method=METHOD,
            note="Enrollment and live features do not overlap enough.",
        )

    distance = 0.0
    for key in keys:
        scale = _SCALES.get(key, 1.0) or 1.0
        distance += abs(float(enrolled[key]) - float(live[key])) / scale
    distance /= len(keys)
    # distance 0 → 100; distance ≥ 1.2 → ~0
    match = int(round(100 * max(0.0, 1.0 - distance / 1.2)))
    mismatch = match < 55
    return IdentityOut(
        enrolled=True,
        match_score=match,
        mismatch=mismatch,
        method=METHOD,
        note=(
            "Likely different speaker (DSP feature card)."
            if mismatch
            else "Consistent with enrolled print (DSP feature card — not ECAPA)."
        ),
    )
