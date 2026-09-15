"""Response models mirroring docs/ENGINE.md Section 7 field for field.

apps/web/src/lib/types.ts must match these. If you change a field name here,
change it there and in ENGINE.md in the same commit.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Band = Literal["genuine", "review", "high"]
Verdict = Literal[
    "clear",
    "review",
    "synthetic_benign",
    "fraud_human",
    "critical",
    "insufficient_audio",
]
Preset = Literal["standard", "high_value"]


class SignalOut(BaseModel):
    key: str
    label: str
    value: float | None = None
    unit: str = ""
    suspicion: float | None = None
    reason: str


class NeuralComponent(BaseModel):
    score: float | None = None
    models: dict[str, float | None] = Field(default_factory=dict)
    disagreement: float | None = None


class ScoreComponent(BaseModel):
    score: float | None = None


class AuthenticityComponents(BaseModel):
    neural: NeuralComponent = Field(default_factory=NeuralComponent)
    dsp: ScoreComponent = Field(default_factory=ScoreComponent)
    disfluency: ScoreComponent = Field(default_factory=ScoreComponent)


class Authenticity(BaseModel):
    score: int
    band: Band
    label: str
    degraded: bool = False
    components: AuthenticityComponents
    signals: list[SignalOut] = Field(default_factory=list)


class ClassifierComponent(BaseModel):
    score: float | None = None
    model: str | None = None


class LexiconComponent(BaseModel):
    score: float | None = None
    categories: list[str] = Field(default_factory=list)
    intents: list[str] = Field(default_factory=list)


class AmountComponent(BaseModel):
    score: float | None = None
    detected_inr: float | None = None
    raw: str | None = None


class FraudComponents(BaseModel):
    classifier: ClassifierComponent = Field(default_factory=ClassifierComponent)
    lexicon: LexiconComponent = Field(default_factory=LexiconComponent)
    amount: AmountComponent = Field(default_factory=AmountComponent)


class MatchedTerm(BaseModel):
    category: str
    term: str


class Fraud(BaseModel):
    score: int
    band: Band
    label: str
    transcript_available: bool = False
    components: FraudComponents
    matched_terms: list[MatchedTerm] = Field(default_factory=list)
    category: str | None = None
    transcript: str | None = None


class Meta(BaseModel):
    window_ms: int | None = None
    audio_ms: int
    latency_ms: int
    profile: str
    retention: str = "features_only"
    engine_version: str
    t_ms: int | None = None
    partial: bool | None = None


class ContextOut(BaseModel):
    """Host metadata enrichment — never blended into authenticity."""

    known_contact: bool | None = None
    unknown_number: bool | None = None
    high_value: bool | None = None
    call_origin: str | None = None
    enrichment_boost: int = 0


class IdentityOut(BaseModel):
    """Lightweight DSP voiceprint — not ECAPA-TDNN."""

    enrolled: bool = False
    match_score: int | None = None
    mismatch: bool | None = None
    method: str = "dsp_features_v1"
    note: str | None = None


class AnalysisOut(BaseModel):
    status: Literal["ok"] = "ok"
    verdict: Verdict
    confidence: float
    authenticity: Authenticity
    fraud: Fraud
    meta: Meta
    context: ContextOut | None = None
    identity: IdentityOut | None = None


class InsufficientOut(BaseModel):
    status: Literal["insufficient_audio"] = "insufficient_audio"
    verdict: Literal["insufficient_audio"] = "insufficient_audio"
    reason: str
    meta: Meta


class HealthOut(BaseModel):
    status: Literal["ok"] = "ok"
    profile: str
    engine_version: str
    calibrated: bool
    models: dict[str, bool]
    notes: list[str] = Field(default_factory=list)
    warming: bool = False
    ready: bool = True
