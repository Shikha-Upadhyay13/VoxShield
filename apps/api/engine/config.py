"""Configuration, profiles, and calibration loading.

Every tunable number lives in calibration.json, not here. See docs/ENGINE.md Section 5.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def enable_utf8_console() -> None:
    """Let the CLI scripts print Hindi text and the rupee sign on Windows.

    The default Windows console encoding is cp1252, which cannot represent Devanagari
    or the rupee sign, so printing a matched Hindi scam phrase raises UnicodeEncodeError
    and kills the run. Characters the terminal font cannot draw become replacement marks,
    which is a cosmetic problem rather than a crash.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass

API_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = API_ROOT.parent.parent
CALIBRATION_PATH = API_ROOT / "calibration.json"
MODEL_CACHE = API_ROOT / ".models"

# Windows without Developer Mode cannot make symlinks, so the Hugging Face cache prints
# a multi-paragraph warning once per repo it downloads. The fallback it describes works
# fine and only costs disk space, so the warning is noise that buries the messages we do
# want to see. Set before any hub import so it takes effect.
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

# The only model IDs the engine is permitted to load (ENGINE.md Section 5).
MODEL_IDS = {
    # AST fine-tuned on ASVspoof5, the 2024 challenge set. Chosen over the
    # otherwise-stronger WpythonW/ast-fakeaudio-detector because that repo is gated
    # behind manual approval by its author, which we cannot depend on before a
    # deadline. This one is BSD-3-Clause and openly downloadable.
    #
    # Its own card reports 0.833 accuracy and 0.859 recall on ASVspoof5 validation.
    # That is lower than the gated model's claimed 0.971, but ASVspoof5 contains far
    # newer attacks than the 2019 data most open detectors were trained on, so the
    # lower number is measured against a harder and more relevant test. Note the
    # recall: it misses roughly one spoof in seven even in-distribution, which is
    # why Stage 1 does not rely on it alone.
    "ast": "MattyB95/AST-ASVspoof5-Synthetic-Voice-Detection",
    # Deliberately a different architecture, and note the opposite label order
    # (0=fake here, 0=Bonafide for the AST model). Both are resolved from id2label.
    "w2v2": "MelodyMachine/Deepfake-audio-detection-V2",
    "silverguard": "tanishqmudaliar/SilverGuard",
    "category": "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7",
}

PROFILES: dict[str, dict[str, Any]] = {
    "full": {"ast": True, "w2v2": True, "whisper": "small", "silverguard": True},
    "lite": {"ast": True, "w2v2": False, "whisper": "base", "silverguard": True},
    # Fraud-first for free-tier / phone demos: SilverGuard + tiny Whisper answer first;
    # AST can be enabled later via VOXSHIELD_ENABLE_AST=1 after the service is warm.
    "mobile": {"ast": False, "w2v2": False, "whisper": "tiny", "silverguard": True},
    "dsp_only": {"ast": False, "w2v2": False, "whisper": None, "silverguard": False},
}

SAMPLE_RATE = 16000
# Live path: short window for responsive fraud/DSP; longer for neural authenticity.
STREAM_WINDOW_S = 3.0
STREAM_FAST_WINDOW_S = 2.5
STREAM_AUTH_WINDOW_S = 5.0
STREAM_INTERVAL_S = 1.0
# Lean profiles still score often enough that speech feels live on CPU.
STREAM_INTERVAL_BY_PROFILE: dict[str, float] = {
    "full": 1.0,
    "lite": 1.2,
    "mobile": 1.5,
    "dsp_only": 1.0,
}
# Run AST/w2v2 on every Nth live score (1 = always). Fast passes skip neural.
STREAM_AUTH_EVERY_N = 3
MAX_UPLOAD_S = 60.0


def stream_interval_s(profile: str | None = None) -> float:
    key = (profile or settings.profile).strip().lower()
    return float(STREAM_INTERVAL_BY_PROFILE.get(key, STREAM_INTERVAL_S))


def stream_auth_every_n() -> int:
    raw = os.environ.get("VOXSHIELD_STREAM_AUTH_EVERY_N")
    if raw and raw.strip().isdigit():
        return max(1, int(raw.strip()))
    return STREAM_AUTH_EVERY_N


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    profile: str = "full"
    enable_ast: bool = True
    enable_w2v2: bool = True
    enable_silverguard: bool = True
    enable_category: bool = False
    enable_antideepfake: bool = False
    whisper_model: str | None = "small"
    whisper_device: str = "cpu"
    whisper_compute: str = "int8"
    calibration: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def load(cls) -> "Settings":
        profile = os.environ.get("VOXSHIELD_PROFILE", "full").strip().lower()
        if profile not in PROFILES:
            profile = "full"
        spec = PROFILES[profile]

        whisper = os.environ.get("VOXSHIELD_WHISPER_MODEL", spec["whisper"])
        if isinstance(whisper, str) and whisper.strip().lower() in {"", "none", "off"}:
            whisper = None

        settings = cls(
            profile=profile,
            enable_ast=_env_bool("VOXSHIELD_ENABLE_AST", spec["ast"]),
            enable_w2v2=_env_bool("VOXSHIELD_ENABLE_W2V2", spec["w2v2"]),
            enable_silverguard=_env_bool("VOXSHIELD_ENABLE_SILVERGUARD", spec["silverguard"]),
            enable_category=_env_bool("VOXSHIELD_ENABLE_CATEGORY", False),
            enable_antideepfake=_env_bool("VOXSHIELD_ENABLE_ANTIDEEPFAKE", False),
            whisper_model=whisper,
        )
        settings.calibration = load_calibration()
        MODEL_CACHE.mkdir(parents=True, exist_ok=True)
        return settings

    # Convenience accessors so callers never dig through raw dicts.

    def thresholds(self, preset: str, score_kind: str) -> dict[str, int]:
        presets = self.calibration["thresholds"]
        chosen = presets.get(preset) or presets["standard"]
        return chosen[score_kind]

    @property
    def gate(self) -> dict[str, float]:
        return self.calibration["gate"]

    @property
    def stage1(self) -> dict[str, Any]:
        return self.calibration["stage1"]

    @property
    def stage2(self) -> dict[str, Any]:
        return self.calibration["stage2"]

    @property
    def dsp(self) -> dict[str, Any]:
        return self.calibration["dsp"]

    def fake_index(self, model_key: str) -> int | None:
        return self.calibration.get("models", {}).get(model_key, {}).get("fake_index")


DEFAULT_CALIBRATION: dict[str, Any] = {
    "engine_version": "1.0",
    "calibrated": False,
    "thresholds": {
        "standard": {
            "authenticity": {"review": 40, "high": 70},
            "fraud": {"review": 35, "high": 65},
        },
        "high_value": {
            "authenticity": {"review": 30, "high": 55},
            "fraud": {"review": 25, "high": 50},
        },
    },
    "gate": {"min_duration_ms": 1000, "min_rms": 0.008, "min_voiced_ratio": 0.08},
    "stage1": {
        "weights": {"neural": 0.55, "dsp": 0.30, "disfluency": 0.15},
        "neural_weights": {"ast": 0.64, "w2v2": 0.36},
        "disagreement_threshold": 0.5,
        "signal_weights": {
            "pitch_stability": 0.20,
            "jitter": 0.18,
            "shimmer": 0.12,
            "pause_regularity": 0.18,
            "hf_cutoff": 0.14,
            "spectral_flatness": 0.10,
            "breath": 0.08,
        },
    },
    "stage2": {
        "weights": {"classifier": 0.40, "lexicon": 0.45, "amount": 0.15},
        # Speech transcripts hit fewer exact phrases than SMS — do not crush a single
        # strong category (OTP / digital arrest) into the mid-band.
        "single_category_multiplier": 0.72,
        "min_words_for_disfluency": 25,
    },
    "models": {
        "ast": {"fake_index": None},
        "w2v2": {"fake_index": None},
        "silverguard": {"scam_index": 1},
    },
    "dsp": {
        "frame_ms": 40,
        "hop_ms": 10,
        "f0_min_hz": 70,
        "f0_max_hz": 400,
        "voicing_threshold": 0.35,
        "min_voiced_frames": 12,
    },
}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_calibration() -> dict[str, Any]:
    """Read calibration.json, merged over defaults so a partial file still works."""
    if not CALIBRATION_PATH.exists():
        return dict(DEFAULT_CALIBRATION)
    try:
        with CALIBRATION_PATH.open("r", encoding="utf-8") as handle:
            on_disk = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return dict(DEFAULT_CALIBRATION)
    return _deep_merge(DEFAULT_CALIBRATION, on_disk)


def save_calibration(data: dict[str, Any]) -> None:
    with CALIBRATION_PATH.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


settings = Settings.load()
