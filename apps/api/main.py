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
from engine.config import SAMPLE_RATE, STREAM_INTERVAL_S, STREAM_WINDOW_S, settings
from engine.schemas import HealthOut

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("voxshield.api")

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("VoxShield engine %s starting, profile=%s", ENGINE_VERSION, settings.profile)
    if not settings.calibration.get("calibrated"):
        logger.warning(
            "Engine is NOT calibrated. Run 'python calibrate.py' against demo/audio/ "
            "before quoting any accuracy number."
        )
    # Warm models up in a thread so the first request is not slow, but do not block
    # startup: a machine with no downloaded weights should still serve DSP-only.
    async def _warm() -> None:
        try:
            await asyncio.to_thread(stage1_neural.warmup)
            await asyncio.to_thread(stage2_fraud.warmup)
            logger.info("Warmup complete: %s", fusion.engine_status()["models"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("Warmup problem: %s", exc)

    task = asyncio.create_task(_warm())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


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
    return HealthOut(
        profile=settings.profile,
        engine_version=ENGINE_VERSION,
        calibrated=bool(settings.calibration.get("calibrated")),
        models=status["models"],
        notes=status["notes"],
    )


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "name": "VoxShield Detection Engine",
        "version": ENGINE_VERSION,
        "contract": "docs/ENGINE.md",
        "endpoints": ["GET /health", "POST /analyze", "WS /stream"],
    }


def _normalize_preset(value: str | None) -> str:
    return value if value in {"standard", "high_value"} else "standard"


def _normalize_language(value: str | None) -> str | None:
    if not value or value.strip().lower() in {"auto", "", "none"}:
        return None
    return value.strip().lower()


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    preset: str = Form("standard"),
    language: str | None = Form(None),
    want_transcript: bool = Form(False),
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
    )
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
        needed = int(STREAM_INTERVAL_S * self.sample_rate)
        return self.samples_since_score >= needed

    @property
    def elapsed_ms(self) -> int:
        return int(1000 * self.total_samples / self.sample_rate) if self.sample_rate else 0

    def window(self) -> tuple[np.ndarray, np.ndarray]:
        native = last_seconds(self.buffer, self.sample_rate, STREAM_WINDOW_S)
        model_audio = resample_to(native, self.sample_rate, SAMPLE_RATE)
        return model_audio, native


@app.websocket("/stream")
async def stream(websocket: WebSocket) -> None:
    await websocket.accept()
    session = StreamSession()
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
                        }
                    )
                    continue
                if kind == "pcm16":
                    chunk = pcm16_to_float(base64.b64decode(parsed.get("data", "")))
                elif kind == "stop":
                    await _score_and_send(websocket, session, final=True)
                    break
                else:
                    continue

            if chunk is None:
                continue

            session.append(chunk)
            if session.should_score:
                await _score_and_send(websocket, session)

    except WebSocketDisconnect:
        logger.info("Stream session closed by client")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Stream session error: %s", exc)
        with contextlib.suppress(Exception):
            await websocket.send_json({"status": "error", "reason": str(exc)})
    finally:
        with contextlib.suppress(Exception):
            await websocket.close()


async def _score_and_send(
    websocket: WebSocket,
    session: StreamSession,
    final: bool = False,
) -> None:
    if session.buffer.size == 0:
        return
    session.busy = True
    session.samples_since_score = 0
    try:
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
            False,
        )
        await websocket.send_json(result.model_dump())
    finally:
        session.busy = False
