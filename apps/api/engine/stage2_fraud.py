"""Stage 2: transcription and fraud scoring.

See docs/ENGINE.md Section 4.

Transcription goes through faster-whisper's bundled PyAV, so no ffmpeg binary is
needed. Fraud scoring combines a pretrained Indian-scam classifier with an
independent, fully auditable lexicon, because the classifier was trained on SMS text
rather than speech transcripts and should not be trusted alone.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .config import MODEL_CACHE, MODEL_IDS, SAMPLE_RATE, settings
from .lexicon import (
    AmountHit,
    LexiconHit,
    MatchedTerm,
    count_disfluencies,
    extract_amount,
    format_inr,
    score_lexicon,
)

logger = logging.getLogger("voxshield.stage2")

MAX_TOKENS = 128


@dataclass
class Transcript:
    text: str
    language: str | None
    available: bool
    error: str | None = None


@dataclass
class FraudAssessment:
    score: float
    classifier_score: float | None
    lexicon: LexiconHit
    amount: AmountHit
    transcript: Transcript
    disfluency_markers: int = 0
    word_count: int = 0
    notes: list[str] = field(default_factory=list)

    @property
    def matched_terms(self) -> list[MatchedTerm]:
        return self.lexicon.terms


class _Transcriber:
    """faster-whisper wrapper. CPU, int8, VAD-filtered."""

    def __init__(self) -> None:
        self.available = False
        self.error: str | None = None
        self._model = None
        self._lock = threading.Lock()
        self._attempted = False

    def load(self) -> None:
        with self._lock:
            if self._attempted:
                return
            self._attempted = True
            model_name = settings.whisper_model
            if not model_name:
                self.error = "Transcription disabled by profile."
                return
            try:
                from faster_whisper import WhisperModel

                self._model = WhisperModel(
                    model_name,
                    device=settings.whisper_device,
                    compute_type=settings.whisper_compute,
                    download_root=str(MODEL_CACHE),
                )
                self.available = True
                logger.info("Loaded faster-whisper '%s' on %s", model_name, settings.whisper_device)
            except Exception as exc:  # noqa: BLE001
                self.error = f"{type(exc).__name__}: {exc}"
                logger.warning("Could not load faster-whisper: %s", self.error)

    def transcribe(
        self,
        samples: np.ndarray,
        language: str | None = None,
        streaming: bool = False,
    ) -> Transcript:
        self.load()
        if not self.available or self._model is None:
            return Transcript("", None, False, self.error or "Transcriber unavailable.")
        try:
            segments, info = self._model.transcribe(
                samples.astype(np.float32),
                language=language,
                beam_size=1 if streaming else 5,
                vad_filter=True,
                condition_on_previous_text=False,
            )
            text = " ".join(segment.text.strip() for segment in segments).strip()
            detected = getattr(info, "language", None)
            return Transcript(text, detected, True)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Transcription failed: %s", exc)
            return Transcript("", None, False, f"{type(exc).__name__}: {exc}")


class _ScamClassifier:
    """SilverGuard: MIT-licensed MobileBERT ONNX for Indian scam text.

    Input and tokenizer layout are discovered at load time rather than assumed, so a
    change in the upstream repo degrades to "unavailable" instead of crashing.
    """

    def __init__(self) -> None:
        self.available = False
        self.error: str | None = None
        self._session = None
        self._tokenizer = None
        self._input_names: set[str] = set()
        self._scam_index = 1
        self._lock = threading.Lock()
        self._attempted = False

    def load(self) -> None:
        with self._lock:
            if self._attempted:
                return
            self._attempted = True
            if not settings.enable_silverguard:
                self.error = "Disabled by profile."
                return
            repo_id = MODEL_IDS["silverguard"]
            try:
                import onnxruntime as ort
                from huggingface_hub import hf_hub_download, list_repo_files
                from transformers import AutoTokenizer

                files = list_repo_files(repo_id)
                onnx_files = [f for f in files if f.endswith(".onnx")]
                if not onnx_files:
                    raise RuntimeError("No .onnx file in the SilverGuard repo.")
                # Prefer a quantized build when the repo offers one.
                onnx_files.sort(key=lambda f: (0 if ("int8" in f or "quant" in f) else 1, len(f)))
                model_path = hf_hub_download(
                    repo_id, onnx_files[0], cache_dir=str(MODEL_CACHE)
                )

                try:
                    self._tokenizer = AutoTokenizer.from_pretrained(
                        repo_id, cache_dir=str(MODEL_CACHE)
                    )
                except Exception:  # noqa: BLE001 - repo may ship weights only
                    self._tokenizer = AutoTokenizer.from_pretrained(
                        "google/mobilebert-uncased", cache_dir=str(MODEL_CACHE)
                    )
                    logger.info("SilverGuard repo has no tokenizer; using google/mobilebert-uncased.")

                options = ort.SessionOptions()
                options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                self._session = ort.InferenceSession(
                    model_path, sess_options=options, providers=["CPUExecutionProvider"]
                )
                self._input_names = {i.name for i in self._session.get_inputs()}
                configured = settings.calibration.get("models", {}).get("silverguard", {})
                self._scam_index = int(configured.get("scam_index", 1))
                self.available = True
                logger.info("Loaded SilverGuard (%s), inputs=%s", onnx_files[0], self._input_names)
            except Exception as exc:  # noqa: BLE001
                self.error = f"{type(exc).__name__}: {exc}"
                logger.warning("Could not load SilverGuard: %s", self.error)

    def score(self, text: str) -> float | None:
        self.load()
        if not self.available or self._session is None or self._tokenizer is None:
            return None
        if not text.strip():
            return None
        try:
            encoded = self._tokenizer(
                text,
                return_tensors="np",
                truncation=True,
                max_length=MAX_TOKENS,
                padding="max_length",
            )
            feeds = {
                name: value.astype(np.int64)
                for name, value in encoded.items()
                if name in self._input_names
            }
            # MobileBERT usually wants token_type_ids; synthesise zeros if absent.
            for required in self._input_names:
                if required not in feeds:
                    feeds[required] = np.zeros_like(
                        encoded["input_ids"], dtype=np.int64
                    )
            logits = np.asarray(self._session.run(None, feeds)[0])[0]
            if logits.size == 1:
                return float(1.0 / (1.0 + np.exp(-logits[0])))
            shifted = logits - np.max(logits)
            exponentiated = np.exp(shifted)
            probabilities = exponentiated / np.sum(exponentiated)
            index = min(self._scam_index, probabilities.size - 1)
            return float(probabilities[index])
        except Exception as exc:  # noqa: BLE001
            logger.warning("SilverGuard scoring failed: %s", exc)
            return None


class _CategoryLabeller:
    """Optional zero-shot naming of the scam type. Labels only, never scores."""

    LABELS = [
        "digital arrest or police threat",
        "OTP or password theft",
        "bank KYC or account freeze",
        "family emergency money request",
        "lottery or prize winnings",
        "investment or trading scheme",
        "parcel or customs duty",
        "job or task offer",
        "ordinary conversation",
    ]

    def __init__(self) -> None:
        self.available = False
        self.error: str | None = None
        self._pipeline = None
        self._lock = threading.Lock()
        self._attempted = False

    def load(self) -> None:
        with self._lock:
            if self._attempted:
                return
            self._attempted = True
            if not settings.enable_category:
                self.error = "Disabled by default."
                return
            try:
                from transformers import pipeline

                self._pipeline = pipeline(
                    "zero-shot-classification",
                    model=MODEL_IDS["category"],
                    device=-1,
                    model_kwargs={"cache_dir": str(MODEL_CACHE)},
                )
                self.available = True
            except Exception as exc:  # noqa: BLE001
                self.error = f"{type(exc).__name__}: {exc}"
                logger.warning("Could not load category labeller: %s", self.error)

    def label(self, text: str) -> str | None:
        self.load()
        if not self.available or self._pipeline is None or not text.strip():
            return None
        try:
            result = self._pipeline(text, candidate_labels=self.LABELS, multi_label=False)
            labels = result.get("labels") or []
            return labels[0] if labels else None
        except Exception as exc:  # noqa: BLE001
            logger.warning("Category labelling failed: %s", exc)
            return None


_transcriber = _Transcriber()
_classifier = _ScamClassifier()
_labeller = _CategoryLabeller()


def warmup() -> dict[str, bool]:
    _transcriber.load()
    _classifier.load()
    if settings.enable_category:
        _labeller.load()
    return model_status()


def model_status() -> dict[str, bool]:
    return {
        "whisper": _transcriber.available,
        "silverguard": _classifier.available,
        "category": _labeller.available,
    }


def status_notes() -> list[str]:
    notes: list[str] = []
    if _transcriber.error and not _transcriber.available:
        notes.append(f"whisper: {_transcriber.error}")
    if _classifier.error and not _classifier.available:
        notes.append(f"silverguard: {_classifier.error}")
    return notes


def transcribe(
    samples: np.ndarray,
    language: str | None = None,
    streaming: bool = False,
) -> Transcript:
    return _transcriber.transcribe(samples, language=language, streaming=streaming)


def assess_fraud(transcript: Transcript) -> FraudAssessment:
    """Combine classifier, lexicon, and amount into a single fraud score."""
    weights = settings.stage2.get("weights", {"classifier": 0.45, "lexicon": 0.40, "amount": 0.15})
    multiplier = float(settings.stage2.get("single_category_multiplier", 0.55))

    text = transcript.text if transcript.available else ""
    lexicon = score_lexicon(text, multiplier)
    amount = extract_amount(text)
    classifier_score = _classifier.score(text) if text.strip() else None
    markers, words = count_disfluencies(text)

    notes: list[str] = []
    components: list[tuple[float, float]] = []
    if classifier_score is not None:
        components.append((float(weights.get("classifier", 0.45)), classifier_score))
    elif text.strip():
        notes.append("Scam classifier unavailable; score is from the lexicon and amounts only.")
    components.append((float(weights.get("lexicon", 0.40)), lexicon.score))
    if amount.score is not None:
        components.append((float(weights.get("amount", 0.15)), amount.score))

    total_weight = sum(w for w, _ in components)
    score = sum(w * v for w, v in components) / total_weight if total_weight > 0 else 0.0

    if amount.amount_inr:
        notes.append(f"Amount requested: {format_inr(amount.amount_inr)}.")
    if not transcript.available:
        notes.append("No transcript, so fraud content could not be assessed.")

    return FraudAssessment(
        score=min(1.0, max(0.0, score)),
        classifier_score=classifier_score,
        lexicon=lexicon,
        amount=amount,
        transcript=transcript,
        disfluency_markers=markers,
        word_count=words,
        notes=notes,
    )


def label_category(text: str) -> str | None:
    return _labeller.label(text)


def classifier_name() -> str | None:
    return "silverguard" if _classifier.available else None
