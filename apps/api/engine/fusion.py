"""Two-score fusion, banding, and the action matrix.

See docs/ENGINE.md Sections 2, 3.4, 7.

The two scores are never merged. A real human reading a scam script must surface as
`fraud_human`, and a single blended number would bury it in the middle band.
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np

from . import ENGINE_VERSION, stage1_neural, stage2_fraud
from .audio_io import check_sufficiency
from .config import SAMPLE_RATE, settings
from .lexicon import format_inr
from .schemas import (
    AmountComponent,
    AnalysisOut,
    Authenticity,
    AuthenticityComponents,
    Band,
    ClassifierComponent,
    Fraud,
    FraudComponents,
    InsufficientOut,
    LexiconComponent,
    MatchedTerm,
    Meta,
    NeuralComponent,
    ScoreComponent,
    SignalOut,
    Verdict,
)
from .signals import disfluency_signal, extract_signals, weighted_suspicion
from .stage2_fraud import Transcript

AUTHENTICITY_LABELS: dict[str, str] = {
    "genuine": "Consistent with a human speaker",
    "review": "Some synthetic patterns",
    "high": "Likely AI-generated",
}

FRAUD_LABELS: dict[str, str] = {
    "genuine": "No fraud indicators",
    "review": "Some fraud indicators",
    "high": "Fraud indicators present",
}


def band_for(score: int, thresholds: dict[str, int]) -> Band:
    if score >= int(thresholds["high"]):
        return "high"
    if score >= int(thresholds["review"]):
        return "review"
    return "genuine"


def decide_verdict(
    authenticity_score: int,
    fraud_score: int,
    authenticity_thresholds: dict[str, int],
    fraud_thresholds: dict[str, int],
) -> Verdict:
    """The action matrix from ENGINE.md Section 2.1, evaluated in order."""
    auth_high = authenticity_score >= int(authenticity_thresholds["high"])
    auth_review = authenticity_score >= int(authenticity_thresholds["review"])
    fraud_high = fraud_score >= int(fraud_thresholds["high"])
    fraud_review = fraud_score >= int(fraud_thresholds["review"])

    if auth_high and fraud_high:
        return "critical"
    if not auth_review and fraud_high:
        return "fraud_human"
    if auth_high and not fraud_review:
        return "synthetic_benign"
    if auth_review or fraud_review:
        return "review"
    return "clear"


def _confidence(
    available_components: int,
    disagreement: float | None,
    audio_seconds: float,
) -> float:
    """How much the engine trusts its own answer.

    Falls with missing layers, model disagreement, and short audio. Reported so the
    UI can hedge honestly instead of showing false precision.
    """
    availability = available_components / 3.0
    agreement = 1.0 - float(disagreement or 0.0)
    duration = min(1.0, max(0.0, (audio_seconds - 1.0) / 5.0))
    raw = 0.45 * availability + 0.35 * max(0.0, agreement) + 0.20 * duration
    return round(min(1.0, max(0.05, raw)), 3)


def _insufficient(reason: str, audio_ms: int, started: float) -> InsufficientOut:
    return InsufficientOut(
        reason=reason,
        meta=Meta(
            audio_ms=audio_ms,
            latency_ms=int((time.perf_counter() - started) * 1000),
            profile=settings.profile,
            engine_version=ENGINE_VERSION,
        ),
    )


def analyze(
    samples: np.ndarray,
    sample_rate: int = SAMPLE_RATE,
    preset: str = "standard",
    language: str | None = None,
    spectral_samples: np.ndarray | None = None,
    spectral_rate: int | None = None,
    streaming: bool = False,
    window_ms: int | None = None,
    t_ms: int | None = None,
    want_transcript: bool = False,
) -> AnalysisOut | InsufficientOut:
    """Run both stages and assemble the ENGINE.md Section 7 payload."""
    started = time.perf_counter()
    audio_ms = int(1000 * samples.size / sample_rate) if sample_rate else 0

    gate_cfg = dict(settings.gate)
    if streaming:
        # Live laptop windows are short and quieter than file uploads. The default
        # voiced-ratio gate was rejecting real speech and returning insufficient_audio
        # while the UI showed captions of the same words — so fraud never ran.
        gate_cfg["min_rms"] = min(float(gate_cfg.get("min_rms", 0.008)), 0.004)
        gate_cfg["min_voiced_ratio"] = min(float(gate_cfg.get("min_voiced_ratio", 0.08)), 0.03)
        gate_cfg["min_duration_ms"] = min(float(gate_cfg.get("min_duration_ms", 1000)), 800)
    gate = check_sufficiency(samples, sample_rate, gate_cfg)
    if not gate.ok:
        return _insufficient(gate.reason, gate.duration_ms, started)

    # ---- Stage 1: acoustic signals -------------------------------------------------
    readings, _track = extract_signals(
        samples,
        sample_rate,
        settings.dsp,
        spectral_samples=spectral_samples,
        spectral_rate=spectral_rate,
    )
    dsp_score, _skipped = weighted_suspicion(
        readings, settings.stage1.get("signal_weights", {})
    )

    # ---- Stage 1: neural pair ------------------------------------------------------
    neural = stage1_neural.score_audio(samples, sample_rate)

    # ---- Stage 2: transcript then fraud -------------------------------------------
    transcript = stage2_fraud.transcribe(samples, language=language, streaming=streaming)
    fraud_assessment = stage2_fraud.assess_fraud(transcript)

    # Disfluency depends on the transcript, so it joins Stage 1 after Stage 2 runs.
    disfluency = disfluency_signal(
        transcript.text if transcript.available else None,
        fraud_assessment.disfluency_markers,
        fraud_assessment.word_count,
        int(settings.stage2.get("min_words_for_disfluency", 25)),
    )
    readings_with_disfluency = [*readings, disfluency]

    # ---- Stage 1 fusion ------------------------------------------------------------
    stage1_weights = settings.stage1.get(
        "weights", {"neural": 0.55, "dsp": 0.30, "disfluency": 0.15}
    )
    components: list[tuple[float, float]] = []
    available = 0
    if neural.fused is not None:
        components.append((float(stage1_weights.get("neural", 0.55)), neural.fused))
        available += 1
    if dsp_score is not None:
        components.append((float(stage1_weights.get("dsp", 0.30)), dsp_score))
        available += 1
    if disfluency.suspicion is not None:
        components.append((float(stage1_weights.get("disfluency", 0.15)), float(disfluency.suspicion)))
        available += 1

    total_weight = sum(w for w, _ in components)
    if total_weight <= 0:
        return _insufficient(
            "No detection layer could analyse this audio.", gate.duration_ms, started
        )
    authenticity_raw = sum(w * v for w, v in components) / total_weight
    authenticity_score = int(round(100 * min(1.0, max(0.0, authenticity_raw))))

    fraud_score = int(round(100 * min(1.0, max(0.0, fraud_assessment.score))))

    # ---- Bands and verdict ---------------------------------------------------------
    auth_thresholds = settings.thresholds(preset, "authenticity")
    fraud_thresholds = settings.thresholds(preset, "fraud")
    authenticity_band = band_for(authenticity_score, auth_thresholds)
    fraud_band = band_for(fraud_score, fraud_thresholds)
    verdict = decide_verdict(authenticity_score, fraud_score, auth_thresholds, fraud_thresholds)

    audio_seconds = samples.size / sample_rate if sample_rate else 0.0
    confidence = _confidence(available, neural.disagreement, audio_seconds)

    # ---- Payload -------------------------------------------------------------------
    signal_payload = [
        SignalOut(
            key=reading.key,
            label=reading.label,
            value=reading.value,
            unit=reading.unit,
            suspicion=reading.suspicion,
            reason=reading.reason,
        )
        for reading in readings_with_disfluency
    ]

    authenticity = Authenticity(
        score=authenticity_score,
        band=authenticity_band,
        label=AUTHENTICITY_LABELS[authenticity_band],
        degraded=neural.fused is None,
        components=AuthenticityComponents(
            neural=NeuralComponent(
                score=neural.fused,
                models=neural.scores,
                disagreement=neural.disagreement,
            ),
            dsp=ScoreComponent(score=dsp_score),
            disfluency=ScoreComponent(score=disfluency.suspicion),
        ),
        signals=signal_payload,
    )

    amount = fraud_assessment.amount
    fraud = Fraud(
        score=fraud_score,
        band=fraud_band,
        label=FRAUD_LABELS[fraud_band],
        transcript_available=transcript.available,
        components=FraudComponents(
            classifier=ClassifierComponent(
                score=fraud_assessment.classifier_score,
                model=stage2_fraud.classifier_name(),
            ),
            lexicon=LexiconComponent(
                score=fraud_assessment.lexicon.score,
                categories=fraud_assessment.lexicon.categories,
            ),
            amount=AmountComponent(
                score=amount.score,
                detected_inr=amount.amount_inr,
                raw=amount.raw,
            ),
        ),
        matched_terms=[
            MatchedTerm(category=term.category, term=term.term)
            for term in fraud_assessment.matched_terms
        ],
        transcript=transcript.text if (want_transcript and transcript.available) else None,
    )

    if settings.enable_category and transcript.available and fraud_score >= int(
        fraud_thresholds["review"]
    ):
        fraud.category = stage2_fraud.label_category(transcript.text)

    return AnalysisOut(
        verdict=verdict,
        confidence=confidence,
        authenticity=authenticity,
        fraud=fraud,
        meta=Meta(
            window_ms=window_ms,
            audio_ms=gate.duration_ms,
            latency_ms=int((time.perf_counter() - started) * 1000),
            profile=settings.profile,
            engine_version=ENGINE_VERSION,
            t_ms=t_ms,
            partial=True if streaming else None,
        ),
    )


def score_text(text: str, preset: str = "standard") -> AnalysisOut:
    """Stage 2 only — score spoken/typed words without audio.

    Used by the live monitor: browser captions arrive immediately, while Whisper on
    CPU lags by 10–20 seconds. Scoring the caption text keeps the fraud ring honest
    in real time. Authenticity is left at 0 (unknown) so a high fraud score surfaces
    as ``fraud_human`` until the audio stage catches up.
    """
    started = time.perf_counter()
    cleaned = (text or "").strip()
    assessment = stage2_fraud.assess_fraud(Transcript(cleaned, None, bool(cleaned)))
    fraud_score = int(round(100 * assessment.score))
    auth_thresholds = settings.thresholds(preset, "authenticity")
    fraud_thresholds = settings.thresholds(preset, "fraud")
    authenticity_score = 0
    authenticity_band = band_for(authenticity_score, auth_thresholds)
    fraud_band = band_for(fraud_score, fraud_thresholds)
    verdict = decide_verdict(
        authenticity_score, fraud_score, auth_thresholds, fraud_thresholds
    )
    amount = assessment.amount

    fraud = Fraud(
        score=fraud_score,
        band=fraud_band,
        label=FRAUD_LABELS[fraud_band],
        transcript_available=bool(cleaned),
        components=FraudComponents(
            classifier=ClassifierComponent(
                score=assessment.classifier_score,
                model=stage2_fraud.classifier_name(),
            ),
            lexicon=LexiconComponent(
                score=assessment.lexicon.score,
                categories=assessment.lexicon.categories,
            ),
            amount=AmountComponent(
                score=amount.score,
                detected_inr=amount.amount_inr,
                raw=amount.raw,
            ),
        ),
        matched_terms=[
            MatchedTerm(category=term.category, term=term.term)
            for term in assessment.matched_terms
        ],
        transcript=cleaned or None,
    )

    authenticity = Authenticity(
        score=authenticity_score,
        band=authenticity_band,
        label="Voice not scored in this text-only pass",
        components=AuthenticityComponents(
            neural=NeuralComponent(),
            dsp=ScoreComponent(),
            disfluency=ScoreComponent(),
        ),
        signals=[],
        degraded=True,
        notes=["Text-only fraud score from live captions / transcript."],
    )

    return AnalysisOut(
        verdict=verdict,
        confidence=0.55 if cleaned else 0.1,
        authenticity=authenticity,
        fraud=fraud,
        meta=Meta(
            audio_ms=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            profile=settings.profile,
            engine_version=ENGINE_VERSION,
            partial=True,
        ),
    )


def summarize(result: AnalysisOut) -> str:
    """One-line human summary, used by calibrate.py and logs."""
    parts = [
        f"verdict={result.verdict}",
        f"auth={result.authenticity.score}({result.authenticity.band})",
        f"fraud={result.fraud.score}({result.fraud.band})",
        f"conf={result.confidence}",
    ]
    if result.fraud.components.amount.detected_inr:
        parts.append(f"amount={format_inr(result.fraud.components.amount.detected_inr)}")
    return " ".join(parts)


def top_reasons(result: AnalysisOut, limit: int = 3) -> list[str]:
    """The most incriminating signals, for alerts and the UI."""
    ranked = sorted(
        (s for s in result.authenticity.signals if s.suspicion is not None),
        key=lambda s: s.suspicion or 0.0,
        reverse=True,
    )
    return [signal.reason for signal in ranked[:limit]]


def engine_status() -> dict[str, Any]:
    status = {**stage1_neural.model_status(), **stage2_fraud.model_status()}
    notes = [*stage1_neural.label_notes(), *stage2_fraud.status_notes()]
    return {"models": status, "notes": notes}
