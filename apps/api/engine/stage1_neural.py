"""Stage 1 neural sub-layer: two detectors with different architectures.

See docs/ENGINE.md Section 3.1. Only the model IDs in config.MODEL_IDS are permitted.

Why two models rather than one good one: measured against modern commercial cloners,
single free detectors score 48-63% accuracy. An AST (spectrogram) and a wav2vec2
(waveform) fail on different inputs, so their disagreement is information rather than
noise, and neither can decide the verdict alone.
"""

from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass
from typing import Any

import numpy as np

from .config import MODEL_CACHE, MODEL_IDS, SAMPLE_RATE, settings

logger = logging.getLogger("voxshield.stage1")

# AST is trained on ~10.24 s windows; longer audio is chunked and averaged.
CHUNK_SECONDS = 10.0

# "ai" is bounded on purpose. Unbounded, it matches inside ordinary words, and because
# the fake pattern is tested first a stray match on a genuine label would invert every
# verdict the product produces.
_FAKE_PATTERN = re.compile(
    r"fake|spoof|synthetic|deepfake|generated|cloned|\bai\b|ai[\s_-]?gen", re.IGNORECASE
)
_REAL_PATTERN = re.compile(r"real|bona[\s_-]?fide|genuine|human|authentic", re.IGNORECASE)


@dataclass
class NeuralResult:
    scores: dict[str, float | None]
    fused: float | None
    disagreement: float | None
    notes: list[str]


def resolve_fake_index(id2label: dict[Any, str] | None, override: int | None) -> tuple[int, bool]:
    """Work out which logit index means "synthetic".

    Returns (index, confident). An inverted label mapping silently flips every
    verdict in the product, so when the labels are uninformative (LABEL_0/LABEL_1)
    we report low confidence and calibrate.py verifies it empirically.
    """
    if override is not None:
        return int(override), True
    if not id2label:
        return 0, False

    normalized = {int(k): str(v) for k, v in id2label.items()}
    for index, label in normalized.items():
        if _FAKE_PATTERN.search(label):
            return index, True
    if len(normalized) == 2:
        for index, label in normalized.items():
            if _REAL_PATTERN.search(label):
                return 1 - index, True
    return 0, False


class _Detector:
    """Lazy-loaded audio classifier. Never raises on load failure."""

    def __init__(self, key: str, model_id: str) -> None:
        self.key = key
        self.model_id = model_id
        self.available = False
        self.confident_labels = False
        self.error: str | None = None
        self._model = None
        self._extractor = None
        self._fake_index = 0
        self._lock = threading.Lock()
        self._attempted = False

    def load(self) -> None:
        with self._lock:
            if self._attempted:
                return
            self._attempted = True
            try:
                import torch
                from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

                torch.set_num_threads(max(1, (torch.get_num_threads() or 2)))
                self._extractor = AutoFeatureExtractor.from_pretrained(
                    self.model_id, cache_dir=str(MODEL_CACHE)
                )
                model = AutoModelForAudioClassification.from_pretrained(
                    self.model_id, cache_dir=str(MODEL_CACHE)
                )
                model.eval()
                self._model = model
                id2label = getattr(model.config, "id2label", None)
                self._fake_index, self.confident_labels = resolve_fake_index(
                    id2label, settings.fake_index(self.key)
                )
                self.available = True
                logger.info(
                    "Loaded %s (%s); fake_index=%s confident=%s labels=%s",
                    self.key, self.model_id, self._fake_index, self.confident_labels, id2label,
                )
            except Exception as exc:  # noqa: BLE001 - a missing model must not kill the API
                self.error = f"{type(exc).__name__}: {exc}"
                logger.warning("Could not load %s (%s): %s", self.key, self.model_id, self.error)

    @property
    def fake_index(self) -> int:
        return self._fake_index

    def score(self, samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> float | None:
        """Probability that the audio is synthetic, averaged across chunks."""
        if not self.available or self._model is None or self._extractor is None:
            return None
        try:
            import torch

            chunk_len = int(CHUNK_SECONDS * sample_rate)
            chunks: list[np.ndarray] = []
            if samples.size <= chunk_len:
                chunks.append(samples)
            else:
                for start in range(0, samples.size, chunk_len):
                    piece = samples[start : start + chunk_len]
                    # Ignore a short tail; it would be mostly padding.
                    if piece.size >= sample_rate:
                        chunks.append(piece)
            if not chunks:
                return None

            probabilities: list[float] = []
            with torch.no_grad():
                for chunk in chunks:
                    inputs = self._extractor(
                        chunk.astype(np.float32),
                        sampling_rate=sample_rate,
                        return_tensors="pt",
                    )
                    logits = self._model(**inputs).logits
                    probs = torch.softmax(logits, dim=-1)[0]
                    index = min(self._fake_index, probs.shape[0] - 1)
                    probabilities.append(float(probs[index]))
            return float(np.mean(probabilities))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Scoring failed for %s: %s", self.key, exc)
            return None


_detectors: dict[str, _Detector] = {}
_registry_lock = threading.Lock()


def get_detector(key: str) -> _Detector | None:
    if key not in MODEL_IDS:
        return None
    with _registry_lock:
        if key not in _detectors:
            _detectors[key] = _Detector(key, MODEL_IDS[key])
    return _detectors[key]


def enabled_keys() -> list[str]:
    keys: list[str] = []
    if settings.enable_ast:
        keys.append("ast")
    if settings.enable_w2v2:
        keys.append("w2v2")
    return keys


def warmup() -> dict[str, bool]:
    """Load enabled detectors up front so the first real request is not slow."""
    status: dict[str, bool] = {}
    for key in enabled_keys():
        detector = get_detector(key)
        if detector is None:
            status[key] = False
            continue
        detector.load()
        status[key] = detector.available
    return status


def model_status() -> dict[str, bool]:
    status: dict[str, bool] = {}
    for key in ("ast", "w2v2"):
        detector = _detectors.get(key)
        status[key] = bool(detector and detector.available)
    return status


def label_notes() -> list[str]:
    notes: list[str] = []
    for key in ("ast", "w2v2"):
        detector = _detectors.get(key)
        if detector and detector.available and not detector.confident_labels:
            notes.append(
                f"{key}: label order is ambiguous, assuming index {detector.fake_index} means "
                "synthetic. Run calibrate.py to verify."
            )
        if detector and detector.error:
            notes.append(f"{key}: {detector.error}")
    return notes


def score_audio(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> NeuralResult:
    """Score with every enabled detector and fuse the results."""
    weights = settings.stage1.get("neural_weights", {"ast": 0.64, "w2v2": 0.36})
    threshold = float(settings.stage1.get("disagreement_threshold", 0.5))

    scores: dict[str, float | None] = {}
    notes: list[str] = []
    for key in enabled_keys():
        detector = get_detector(key)
        if detector is None:
            scores[key] = None
            continue
        detector.load()
        if not detector.available:
            scores[key] = None
            if detector.error:
                notes.append(f"{key} unavailable: {detector.error}")
            continue
        scores[key] = detector.score(samples, sample_rate)

    present = {k: v for k, v in scores.items() if v is not None}
    if not present:
        return NeuralResult(scores, None, None, notes or ["No neural detector available."])

    total_weight = sum(float(weights.get(k, 0.0)) for k in present) or 1.0
    fused = sum(float(weights.get(k, 0.0)) * v for k, v in present.items()) / total_weight

    disagreement: float | None = None
    if len(present) >= 2:
        values = list(present.values())
        disagreement = float(max(values) - min(values))
        if disagreement > threshold:
            notes.append(
                f"The two detectors disagree by {disagreement:.2f}. Treating this as uncertain "
                "and leaning on the acoustic signals instead."
            )

    return NeuralResult(scores, float(fused), disagreement, notes)
