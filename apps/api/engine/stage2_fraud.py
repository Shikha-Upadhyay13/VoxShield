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

# Synthetic sender SilverGuard sees for voice transcripts. The model was trained on
# SMS where a raw phone number (vs a registered DLT ID like JD-SBINOT) is itself a
# strong scam signal. Calls have no DLT header; without a stand-in, many clear scam
# scripts score 0 on the classifier alone.
VOICE_CALL_HEADER = "+910000000000"


class _SilverGuardTokenizer:
    """WordPiece tokenizer that matches SilverGuard's ONNX export exactly.

    The model card ships this logic alongside vocab.txt. Hugging Face's BertTokenizer
    is close but not identical (Unicode normalisation and punctuation splitting differ),
    and the mismatch was enough to drive clear scam scripts to a threat score of 0.
    """

    def __init__(self, vocab_file: str) -> None:
        import re
        import unicodedata

        self._re = re
        self._unicodedata = unicodedata
        with open(vocab_file, encoding="utf-8") as handle:
            self.vocab = {line.rstrip("\n"): index for index, line in enumerate(handle)}
        self.cls_id = self.vocab.get("[CLS]", 101)
        self.sep_id = self.vocab.get("[SEP]", 102)
        self.pad_id = self.vocab.get("[PAD]", 0)
        self.unk_id = self.vocab.get("[UNK]", 100)

    def _wordpiece(self, word: str) -> list[int]:
        ids: list[int] = []
        start = 0
        while start < len(word):
            end = len(word)
            current = None
            while start < end:
                piece = ("##" if start > 0 else "") + word[start:end]
                if piece in self.vocab:
                    current = self.vocab[piece]
                    break
                end -= 1
            if current is None:
                return [self.unk_id]
            ids.append(current)
            start = end
        return ids

    def encode(
        self,
        text_a: str,
        text_b: str | None = None,
        max_length: int = MAX_TOKENS,
    ) -> tuple[list[int], list[int]]:
        def pieces(text: str) -> list[int]:
            normalised = self._unicodedata.normalize("NFD", text.lower())
            return [
                wp
                for token in self._re.findall(r"\w+|[^\w\s]", normalised)
                for wp in self._wordpiece(token)
            ]

        ids_a = pieces(text_a)
        ids_b = pieces(text_b) if text_b else None
        budget = max_length - (3 if ids_b else 2)
        if ids_b is not None:
            while len(ids_a) + len(ids_b) > budget:
                (ids_a if len(ids_a) >= len(ids_b) else ids_b).pop()
        else:
            ids_a = ids_a[:budget]

        tokens = [self.cls_id] + ids_a + [self.sep_id]
        if ids_b is not None:
            tokens += ids_b + [self.sep_id]
        mask = [1] * len(tokens)
        pad = max_length - len(tokens)
        tokens += [self.pad_id] * pad
        mask += [0] * pad
        return tokens, mask


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
                # Live laptop mics are quieter and choppier than file uploads. Silero VAD
                # was deleting entire 1–3 s windows (see stream logs: "removed 00:01.536 of
                # 00:01.536"), which left Stage 2 with silence and the UI looking broken.
                # Keep VAD for offline uploads; skip it on the live path.
                vad_filter=not streaming,
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
        self._output_is_probability = True
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

                files = list_repo_files(repo_id)
                onnx_files = [f for f in files if f.endswith(".onnx")]
                if not onnx_files:
                    raise RuntimeError("No .onnx file in the SilverGuard repo.")
                # Prefer a quantized build when the repo offers one.
                onnx_files.sort(key=lambda f: (0 if ("int8" in f or "quant" in f) else 1, len(f)))
                model_path = hf_hub_download(
                    repo_id, onnx_files[0], cache_dir=str(MODEL_CACHE)
                )

                # Use the tokenizer that ships with the ONNX export. Hugging Face's
                # BertTokenizer is close but not identical, and the mismatch was enough
                # to drive clear scam scripts to a threat score of 0.
                vocab_path = hf_hub_download(repo_id, "vocab.txt", cache_dir=str(MODEL_CACHE))
                self._tokenizer = _SilverGuardTokenizer(vocab_path)

                options = ort.SessionOptions()
                options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                self._session = ort.InferenceSession(
                    model_path, sess_options=options, providers=["CPUExecutionProvider"]
                )
                self._input_names = {i.name for i in self._session.get_inputs()}
                output_names = [o.name for o in self._session.get_outputs()]
                # SilverGuard's card is explicit: threat_score is already the softmax
                # scam probability. Applying sigmoid again maps a true 0.0 to 0.5 and
                # collapses every score into a useless mid-band — which is exactly what
                # the first smoke eval measured.
                self._output_is_probability = (
                    not output_names or "threat_score" in output_names
                )
                configured = settings.calibration.get("models", {}).get("silverguard", {})
                self._scam_index = int(configured.get("scam_index", 1))
                self.available = True
                logger.info(
                    "Loaded SilverGuard (%s), inputs=%s, outputs=%s",
                    onnx_files[0],
                    self._input_names,
                    output_names,
                )
            except Exception as exc:  # noqa: BLE001
                self.error = f"{type(exc).__name__}: {exc}"
                logger.warning("Could not load SilverGuard: %s", self.error)

    def score(self, text: str, sender_header: str | None = None) -> float | None:
        """Return scam probability in [0, 1].

        SilverGuard was trained on SMS with an optional TRAI DLT sender header in the
        form ``HEADER [SEP] message``. Voice transcripts have no sender ID, so we pass
        the message alone — which the model card says is the correct fallback.
        """
        self.load()
        if not self.available or self._session is None or self._tokenizer is None:
            return None
        if not text.strip():
            return None
        try:
            header = (sender_header or "").strip()
            if header:
                ids, mask = self._tokenizer.encode(header, text, max_length=MAX_TOKENS)
            else:
                ids, mask = self._tokenizer.encode(text, max_length=MAX_TOKENS)
            feeds = {
                "input_ids": np.asarray([ids], dtype=np.int64),
                "attention_mask": np.asarray([mask], dtype=np.int64),
            }
            feeds = {name: value for name, value in feeds.items() if name in self._input_names}
            raw = np.asarray(self._session.run(None, feeds)[0]).reshape(-1)
            if raw.size == 1:
                value = float(raw[0])
                if self._output_is_probability:
                    return min(1.0, max(0.0, value))
                return float(1.0 / (1.0 + np.exp(-value)))
            shifted = raw - np.max(raw)
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


def assess_fraud(
    transcript: Transcript,
    sender_header: str | None = None,
) -> FraudAssessment:
    """Combine classifier, lexicon, and amount into a single fraud score.

    ``sender_header`` is the TRAI DLT / phone-number prefix SilverGuard was trained
    with. ``None`` means "this is a voice transcript" — we may inject
    ``VOICE_CALL_HEADER`` when the lexicon already looks suspicious. An empty string
    forces no header, which is what the SMS evaluation harness uses.
    """
    weights = settings.stage2.get("weights", {"classifier": 0.45, "lexicon": 0.40, "amount": 0.15})
    multiplier = float(settings.stage2.get("single_category_multiplier", 0.55))

    text = transcript.text if transcript.available else ""
    lexicon = score_lexicon(text, multiplier)
    amount = extract_amount(text)

    amount_inr = amount.amount_inr or 0.0
    lexicon_suspicious = len(lexicon.categories) >= 2 or amount_inr >= 10_000
    if sender_header is None:
        # Only add the synthetic caller ID when the words already look like a scam.
        # Blindly prefixing every transcript made SilverGuard flag "please send the
        # meeting notes" and a bank OTP SMS, because a raw +91 header is itself a
        # strong scam feature in its training data.
        header = VOICE_CALL_HEADER if lexicon_suspicious else ""
    else:
        header = sender_header

    classifier_score = (
        _classifier.score(text, header or None) if text.strip() else None
    )
    markers, words = count_disfluencies(text)

    notes: list[str] = []
    components: list[tuple[float, float]] = []

    use_classifier = classifier_score is not None
    if use_classifier and lexicon_suspicious and classifier_score < 0.25 and lexicon.score >= 0.5:
        # SilverGuard was trained on English SMS. On Hinglish speech transcripts it
        # sometimes returns a confident "ham" on scripts the lexicon and amount
        # extractor both flag hard. Trust the auditable layers in that disagreement.
        notes.append(
            "Classifier disagreed with the lexicon on a multi-signal script; "
            "using lexicon and amount only."
        )
        use_classifier = False

    if use_classifier:
        components.append((float(weights.get("classifier", 0.45)), classifier_score))
    elif text.strip() and classifier_score is None:
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
