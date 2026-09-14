"""VoxShield detection API.

Endpoints follow docs/ENGINE.md Section 7.2:
    GET  /health    which models actually loaded
    POST /analyze   multipart upload, whole-file analysis
    WS   /stream    live microphone chunks

Run locally:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
import os
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from engine import ENGINE_VERSION, fusion, stage1_neural, stage2_fraud
from engine.audio_io import (
    DecodeError,
    decode_native,
    last_seconds,
    pcm16_to_float,
    resample_to,
)
from engine.config import SAMPLE_RATE, STREAM_WINDOW_S, settings, stream_interval_s
from engine.schemas import HealthOut

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("voxshield.api")

# Comma-separated extra origins from the host (Vercel production domain, etc.).
_extra_origins = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
ALLOWED_ORIGINS = list(
    dict.fromkeys(
        [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            *_extra_origins,
        ]
    )
)

# Set True while background model warmup is still running.
_warming = False


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    global _warming
    logger.info("VoxShield engine %s starting, profile=%s", ENGINE_VERSION, settings.profile)
    if not settings.calibration.get("calibrated"):
        logger.warning(
            "Engine is NOT calibrated. Run 'python calibrate.py' against demo/audio/ "
            "before quoting any accuracy number."
        )

    async def _warm() -> None:
        global _warming
        _warming = True
        try:
            # Fraud path first so /score-text works while authenticity models load.
            await asyncio.to_thread(stage2_fraud.warmup)
            await asyncio.to_thread(stage1_neural.warmup)
            logger.info("Warmup complete: %s", fusion.engine_status()["models"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("Warmup problem: %s", exc)
        finally:
            _warming = False

    task = asyncio.create_task(_warm())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        _warming = False


app = FastAPI(
    title="VoxShield Detection Engine",
    version=ENGINE_VERSION,
    description="Two-stage detection: is the voice synthetic, and is the speech fraudulent.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    status = fusion.engine_status()
    models = status["models"]
    # Ready for live fraud when SilverGuard is up (or lexicon-only dsp_only profile).
    fraud_ready = bool(models.get("silverguard")) or settings.profile == "dsp_only"
    return HealthOut(
        profile=settings.profile,
        engine_version=ENGINE_VERSION,
        calibrated=bool(settings.calibration.get("calibrated")),
        models=models,
        notes=status["notes"],
        warming=_warming,
        ready=fraud_ready,
    )


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "name": "VoxShield Detection Engine",
        "version": ENGINE_VERSION,
        "contract": "docs/ENGINE.md",
        "endpoints": [
            "GET /health",
            "GET /v1/capabilities",
            "POST /analyze",
            "POST /score-text",
            "WS /stream",
            "WS /ws/call-stream/{call_id}",
        ],
    }


@app.get("/v1/capabilities")
async def capabilities() -> dict[str, Any]:
    """Integrator discovery: profile, loaded models, languages, public contract."""
    status = fusion.engine_status()
    models = status["models"]
    fraud_ready = bool(models.get("silverguard")) or settings.profile == "dsp_only"
    return {
        "name": "VoxShield Core",
        "version": ENGINE_VERSION,
        "profile": settings.profile,
        "calibrated": bool(settings.calibration.get("calibrated")),
        "models": models,
        "languages": ["auto", "en", "hi"],
        "scores": ["authenticity", "fraud"],
        "verdicts": [
            "clear",
            "review",
            "fraud_human",
            "synthetic_benign",
            "critical",
            "insufficient_audio",
        ],
        "endpoints": [
            "GET /health",
            "GET /v1/capabilities",
            "POST /analyze",
            "POST /score-text",
            "WS /stream",
            "WS /ws/call-stream/{call_id}",
        ],
        "notes": [
            *status["notes"],
            "Two scores are never blended; hosts act on the verdict matrix.",
            "Speaker verification is DSP voiceprint only (dsp_features_v1) — not ECAPA.",
            "gRPC SDKs are Phase later — REST + WebSocket for SIH.",
        ],
        "warming": _warming,
        "ready": fraud_ready,
        "recommended_host_actions": {
            "clear": "Continue",
            "review": "Soft warn / secondary check",
            "fraud_human": "Warn, hold high-value action, request MFA or callback",
            "synthetic_benign": "Flag synthetic voice; fraud content not elevated",
            "critical": "Block / cut / escalate immediately",
        },
    }


def _normalize_preset(value: str | None) -> str:
    return value if value in {"standard", "high_value"} else "standard"


def _normalize_language(value: str | None) -> str | None:
    if not value or value.strip().lower() in {"auto", "", "none"}:
        return None
    return value.strip().lower()


def _parse_optional_bool(value: str | bool | None) -> bool | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return None


def _build_call_context(
    known_contact: str | bool | None = None,
    unknown_number: str | bool | None = None,
    high_value: str | bool | None = None,
    call_origin: str | None = None,
) -> dict[str, Any] | None:
    ctx: dict[str, Any] = {
        "known_contact": _parse_optional_bool(known_contact),
        "unknown_number": _parse_optional_bool(unknown_number),
        "high_value": _parse_optional_bool(high_value),
        "call_origin": (call_origin or "").strip() or None,
    }
    if all(v is None for v in ctx.values()):
        return None
    return ctx


def _parse_enrollment_features(raw: str | None) -> dict[str, Any] | None:
    if not raw or not str(raw).strip():
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    preset: str = Form("standard"),
    language: str | None = Form(None),
    want_transcript: bool = Form(True),
    known_contact: str | None = Form(None),
    unknown_number: str | None = Form(None),
    high_value: str | None = Form(None),
    call_origin: str | None = Form(None),
    enrollment_features: str | None = Form(None),
) -> JSONResponse:
    payload = await file.read()
    if not payload:
        return JSONResponse({"status": "error", "reason": "Empty upload."}, status_code=400)

    try:
        # Keep the file at its native rate for spectral work, and make a 16 kHz copy
        # for the models. Resampling to 16 kHz caps analysis at 8 kHz and would hide a
        # vocoder ceiling sitting above it.
        native, native_rate = await asyncio.to_thread(decode_native, payload)
    except DecodeError as exc:
        return JSONResponse({"status": "error", "reason": str(exc)}, status_code=415)

    model_audio = await asyncio.to_thread(resample_to, native, native_rate, SAMPLE_RATE)
    call_context = _build_call_context(known_contact, unknown_number, high_value, call_origin)
    enrolled = _parse_enrollment_features(enrollment_features)

    result = await asyncio.to_thread(
        fusion.analyze,
        model_audio,
        SAMPLE_RATE,
        _normalize_preset(preset),
        _normalize_language(language),
        native,
        native_rate,
        False,
        None,
        None,
        bool(want_transcript),
        call_context,
        enrolled,
    )
    return JSONResponse(result.model_dump())


@app.post("/score-text")
async def score_text(
    text: str = Form(...),
    preset: str = Form("standard"),
    known_contact: str | None = Form(None),
    unknown_number: str | None = Form(None),
    high_value: str | None = Form(None),
    call_origin: str | None = Form(None),
) -> JSONResponse:
    """Score fraud from transcript/captions alone — no audio required.

    The live UI calls this as soon as browser captions update, so a spoken scam
    script turns the fraud ring red without waiting for Whisper on CPU.
    """
    cleaned = (text or "").strip()
    if len(cleaned) < 3:
        return JSONResponse(
            {"status": "error", "reason": "Need a few words to score."},
            status_code=400,
        )
    call_context = _build_call_context(known_contact, unknown_number, high_value, call_origin)
    result = await asyncio.to_thread(
        fusion.score_text, cleaned, _normalize_preset(preset), call_context
    )
    logger.info("Text score %s :: %s", fusion.summarize(result), cleaned[:80])
    return JSONResponse(result.model_dump())


class StreamSession:
    """Accumulates live audio and re-scores a trailing window.

    Analysis runs in a worker thread and is skipped while one is already in flight, so
    a slow CPU degrades the update rate rather than building an unbounded backlog.
    """

    def __init__(self) -> None:
        self.sample_rate = SAMPLE_RATE
        self.preset = "standard"
        self.language: str | None = None
        self.call_context: dict[str, Any] | None = None
        self.enrollment_features: dict[str, Any] | None = None
        self.buffer = np.zeros(0, dtype=np.float32)
        self.total_samples = 0
        self.samples_since_score = 0
        self.busy = False

    def configure(self, message: dict[str, Any]) -> None:
        rate = message.get("sample_rate")
        if isinstance(rate, (int, float)) and 8000 <= rate <= 192000:
            self.sample_rate = int(rate)
        self.preset = _normalize_preset(message.get("preset"))
        self.language = _normalize_language(message.get("language"))
        self.call_context = _build_call_context(
            message.get("known_contact"),
            message.get("unknown_number"),
            message.get("high_value"),
            message.get("call_origin"),
        )
        enrolled = message.get("enrollment_features")
        if isinstance(enrolled, dict):
            self.enrollment_features = enrolled
        elif isinstance(enrolled, str):
            self.enrollment_features = _parse_enrollment_features(enrolled)
        else:
            self.enrollment_features = None

    def append(self, chunk: np.ndarray) -> None:
        if chunk.size == 0:
            return
        self.buffer = np.concatenate([self.buffer, chunk])
        self.total_samples += chunk.size
        self.samples_since_score += chunk.size
        # Only the trailing window is ever scored; drop older audio so memory is bounded.
        keep = int(STREAM_WINDOW_S * self.sample_rate * 1.5)
        if self.buffer.size > keep:
            self.buffer = self.buffer[-keep:]

    @property
    def should_score(self) -> bool:
        if self.busy:
            return False
        needed = int(stream_interval_s() * self.sample_rate)
        return self.samples_since_score >= needed

    @property
    def elapsed_ms(self) -> int:
        return int(1000 * self.total_samples / self.sample_rate) if self.sample_rate else 0

    def window(self) -> tuple[np.ndarray, np.ndarray]:
        native = last_seconds(self.buffer, self.sample_rate, STREAM_WINDOW_S)
        model_audio = resample_to(native, self.sample_rate, SAMPLE_RATE)
        return model_audio, native

    def has_speech_energy(self) -> bool:
        """Skip scoring when the trailing window is effectively silence."""
        if self.buffer.size == 0 or not self.sample_rate:
            return False
        native = last_seconds(self.buffer, self.sample_rate, STREAM_WINDOW_S)
        if native.size == 0:
            return False
        rms = float(np.sqrt(np.mean(np.square(native))))
        return rms >= 0.004


@app.websocket("/stream")
async def stream(websocket: WebSocket) -> None:
    await _run_stream_session(websocket)


@app.websocket("/ws/call-stream/{call_id}")
async def stream_call_alias(websocket: WebSocket, call_id: str) -> None:
    """Alias for hosts that open ``/ws/call-stream/<id>`` instead of ``/stream``.

    Some demo shells hit this path; without the alias the connection is rejected with
    403 and the UI falls back to a scorer that cannot detect fraud at all.
    """
    logger.info("Stream alias opened for call_id=%s", call_id)
    await _run_stream_session(websocket)


async def _run_stream_session(websocket: WebSocket) -> None:
    await websocket.accept()
    session = StreamSession()
    score_task: asyncio.Task[None] | None = None
    logger.info("Stream session opened")

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            chunk: np.ndarray | None = None

            if (payload := message.get("bytes")) is not None:
                chunk = pcm16_to_float(payload)
            elif (text := message.get("text")) is not None:
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError:
                    continue
                kind = parsed.get("type")
                if kind in {"start", "config"}:
                    session.configure(parsed)
                    await websocket.send_json(
                        {
                            "status": "ready",
                            "sample_rate": session.sample_rate,
                            "preset": session.preset,
                            "engine_version": ENGINE_VERSION,
                            "note": (
                                "First score on CPU usually takes 10–20 seconds because "
                                "transcription and both detectors run on the trailing window."
                            ),
                        }
                    )
                    continue
                if kind == "pcm16":
                    chunk = pcm16_to_float(base64.b64decode(parsed.get("data", "")))
                elif kind == "stop":
                    if score_task and not score_task.done():
                        await score_task
                    await _score_and_send(websocket, session, final=True)
                    break
                else:
                    continue

            if chunk is None:
                continue

            session.append(chunk)
            if session.should_score:
                if not session.has_speech_energy():
                    session.samples_since_score = 0
                    continue
                score_task = asyncio.create_task(_score_and_send(websocket, session))

    except WebSocketDisconnect:
        logger.info("Stream session closed by client")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Stream session error: %s", exc)
        with contextlib.suppress(Exception):
            await websocket.send_json({"status": "error", "reason": str(exc)})
    finally:
        if score_task and not score_task.done():
            score_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await score_task
        with contextlib.suppress(Exception):
            await websocket.close()


async def _score_and_send(
    websocket: WebSocket,
    session: StreamSession,
    final: bool = False,
) -> None:
    if session.buffer.size == 0:
        return
    if session.busy and not final:
        return
    session.busy = True
    session.samples_since_score = 0
    try:
        with contextlib.suppress(Exception):
            await websocket.send_json(
                {
                    "status": "analysing",
                    "t_ms": session.elapsed_ms,
                    "audio_ms": int(1000 * session.buffer.size / session.sample_rate)
                    if session.sample_rate
                    else 0,
                }
            )
        model_audio, native = session.window()
        result = await asyncio.to_thread(
            fusion.analyze,
            model_audio,
            SAMPLE_RATE,
            session.preset,
            session.language,
            native,
            session.sample_rate,
            not final,
            int(STREAM_WINDOW_S * 1000),
            session.elapsed_ms,
            True,  # always return the transcript for the live UI
            session.call_context,
            session.enrollment_features,
        )
        # Client may have hung up while CPU scored — never throw on a dead socket.
        try:
            await websocket.send_json(result.model_dump())
        except (WebSocketDisconnect, RuntimeError) as send_exc:
            logger.info("Stream result not sent (client gone): %s", send_exc or type(send_exc).__name__)
            return
        if result.status == "ok":
            logger.info("Stream score %s", fusion.summarize(result))
        else:
            logger.info("Stream gate: %s", result.reason)
    except asyncio.CancelledError:
        raise
    except WebSocketDisconnect:
        logger.info("Stream score aborted: client disconnected")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Stream score failed: %s: %s", type(exc).__name__, exc or repr(exc))
        with contextlib.suppress(Exception):
            await websocket.send_json({"status": "error", "reason": str(exc) or type(exc).__name__})
    finally:
        session.busy = False