# VoxShield — System architecture and host integration

**Status:** Describes what is built today (September 2026), not a future roadmap.  
**Detection formulas and model IDs:** [ENGINE.md](./ENGINE.md) remains authoritative for scoring.  
**Product scope:** [PRD.md](../PRD.md)

This file answers three questions:

1. What software did we actually build?
2. Which models and technologies run, and where?
3. How does a host (Truecaller, a bank dialler, or a Flutter demo app) integrate — and what will work on demo day with “real calls”?

---

## 1. What we built

VoxShield is **software**: a **privacy-preserving detection engine** plus **demo hosts** that prove it.

It is **not** a consumer calling app, not Truecaller, and not a telecom switch. SIH26104 asks for an **API / SDK layer** that existing platforms can embed. That is the product.

| Piece | Role | Ships as |
|---|---|---|
| **VoxShield Core** | The product. Two independent scores + a verdict. | Python FastAPI in `apps/api` |
| **TypeScript SDK** | Thin client for REST + WebSocket | `apps/web/src/sdk` (contract for any language) |
| **Web adapters** | Reference hosts so judges can *see* the engine | Next.js app in `apps/web` |

```
┌─────────────────────────────────────────────────────────────────┐
│  HOST  (not VoxShield)                                          │
│  Truecaller · bank dialler · CCaaS · Flutter demo app           │
│  Owns: the call, the UI, permissions, hang-up / Hold / MFA    │
└────────────┬───────────────────────────────┬──────────────────┘
             │ REST                            │ WebSocket
             │ POST /analyze                   │ WS /stream
             │ POST /score-text               │ PCM16 @ 16 kHz
             ▼                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  VOXSHIELD CORE                                                 │
│  FastAPI  ·  CPU  ·  no raw audio stored                           │
│                                                                 │
│  Stage 1 authenticity     Stage 2 fraud                        │
│  (is the voice fake?)     (are the words a scam?)               │
│           \                     /                              │
│            \                   /                               │
│             verdict: clear | review | fraud_human                │
│                      | synthetic_benign | critical              │
└─────────────────────────────────────────────────────────────────┘
```

The Next.js site is a **reference implementation of a host**, not the engine:

| Route | What it pretends to be |
|---|---|
| `/monitor` (Call adapter) | A dialler: mic → `WS /stream` |
| `/adapters/bank` | A bank transfer screen that can Hold / MFA |
| `/operations` | curl / OpenAPI-style integrator panel |
| `/demo` | Judge scripts via `/score-text` |

A Flutter “Truecaller-like” app is the same idea as `/monitor`: **another host** talking to the same Core.

---

## 2. Two scores, never blended

Hosts must not average these into one “risk %”. A real human reading a scam script must surface as `fraud_human`.

| Stage | Question | Main evidence |
|---|---|---|
| **1 — Authenticity** | Is this voice synthetic / cloned? | AST + wav2vec2 + DSP (pitch, jitter, shimmer, spectrum) |
| **2 — Fraud** | Is this speech trying to steal money or secrets? | SilverGuard + intent lexicon + amount extraction |

**Verdict matrix** (host action):

| Authenticity | Fraud | `verdict` | Host should |
|---|---|---|---|
| High (clone) | High | `critical` | Warn hard; auto-cut if policy says so |
| Human | High | `fraud_human` | Warn; hold transfer; MFA / callback |
| High (clone) | Low | `synthetic_benign` | Flag fake voice (IVR / assistant) |
| Clone **or** voiceprint mismatch **and** any OTP/PIN ask | Forced high fraud | `critical` | Clone saying “Hotstar OTP” is still an attack |
| Neither elevated | — | `clear` | Continue |

Words cannot prove where an OTP will be typed. **Entertainment OTP** (Hotstar / Prime / Netflix) from a human relative is not scored as a bank harvest. The **same sentence from a cloned or mismatched voice** is `critical`.

---

## 3. Models and technologies in use

All neural work is **inference only**. We do not train or fine-tune. Weights download into `apps/api/.models/` (gitignored). CPU only.

### 3.1 Stage 1 — synthetic voice

| Component | Technology | Hugging Face / notes |
|---|---|---|
| Primary neural | AST (spectrogram ViT) | `MattyB95/AST-ASVspoof5-Synthetic-Voice-Detection` |
| Cross-check | wav2vec2 | `MelodyMachine/Deepfake-audio-detection-V2` |
| Runtime | PyTorch + Hugging Face `transformers` | Opposite label orders; mapped from `id2label` |
| DSP | NumPy / SciPy | Pitch stability, jitter, shimmer, pauses, HF cutoff, flatness, breath |
| Voiceprint (stub) | DSP feature compare | `dsp_features_v1` — **not** ECAPA-TDNN |

Live stream: most ticks are **fast** (DSP only). Every 4th tick runs the neural pair so the laptop stays usable.

### 3.2 Stage 2 — speech and scam language

| Component | Technology | Hugging Face / notes |
|---|---|---|
| Transcription | faster-whisper (int8 CPU, PyAV decode — no ffmpeg) | `small` / `base` / `tiny` by profile |
| Scam classifier | SilverGuard MobileBERT **ONNX** | `tanishqmudaliar/SilverGuard` via onnxruntime |
| Intent lexicon | Deterministic Python | Collocations, not lone keywords (`otp`, `transfer`, `kyc`) |
| Amounts | Regex | `50 hazaar`, `2 lakh`, `₹10,000` |

Live fraud on the Call adapter also uses **browser captions → `POST /score-text`** so the fraud ring does not wait for Whisper on CPU.

### 3.3 Profiles (what actually loads)

| Profile | Typical use | What runs |
|---|---|---|
| `full` | Local laptop demo | AST + wav2vec2 + whisper-small + SilverGuard |
| `lite` | Always-on small VM | AST + whisper-base + SilverGuard |
| `mobile` | Free-tier RAM | SilverGuard + whisper-tiny + DSP (fraud-first) |
| `dsp_only` | No downloads | DSP + lexicon only |

### 3.4 Application stack

| Layer | Choice |
|---|---|
| Engine API | Python 3.11, FastAPI, Uvicorn, Pydantic |
| Audio I/O | PyAV, soundfile, 16 kHz mono float32 internally |
| Web demo | Next.js (App Router), TypeScript, Tailwind, Web Audio `getUserMedia` |
| Live transport | WebSocket, **PCM16 little-endian mono** (prefer 16 kHz) |
| File transport | `POST /analyze` multipart (wav / webm / mp3 / m4a) |
| Privacy | Raw audio is not stored; only scores / signals / term labels |

---

## 4. Public contract (what a host implements)

Discover: `GET /health` and `GET /v1/capabilities` (no key). Scoring needs a host key when Core has `VOXSHIELD_API_KEY` set.

| Endpoint | When to use |
|---|---|
| `POST /analyze` | Whole clip (upload, offline QA, SIH file fallback) |
| `POST /score-text` | Transcript / live captions — fraud only, no authenticity |
| `WS /stream` | Live call audio (primary product path) |
| `WS /ws/call-stream/{call_id}` | Same stream, host-supplied call id |

**API key (hosts)**

Set the same secret on Core and in the app:

```bash
# Core (apps/api)
VOXSHIELD_API_KEY=your-secret

# Next.js demo UI
NEXT_PUBLIC_VOXSHIELD_API_KEY=your-secret
```

| Channel | How to send it |
|---|---|
| REST | Header `X-API-Key: your-secret` or `Authorization: Bearer your-secret` |
| WebSocket | Query `ws://host:8000/stream?api_key=your-secret`, header `X-API-Key`, or `"api_key"` on the `start` JSON |

If `VOXSHIELD_API_KEY` is empty, scoring stays open (local laptop). `GET /v1/capabilities` → `auth.api_key_required` tells the host which mode is live.

**Live session**

1. Open `ws://<host>:8000/stream` (or `wss://` in production).
2. Send JSON:

```json
{
  "type": "start",
  "sample_rate": 16000,
  "preset": "standard",
  "language": null,
  "known_contact": false,
  "unknown_number": true,
  "high_value": false,
  "call_origin": "unknown",
  "api_key": "your-secret"
}
```

3. Wait for `{ "status": "ready", ... }`.
4. Send **binary** frames: raw PCM16 LE mono. Optionally JSON `{ "type": "pcm16", "data": "<base64>" }`.
5. Receive JSON results (`status: "ok"`) with `authenticity`, `fraud`, `verdict`, `matched_terms`.
6. Send `{ "type": "stop" }` and close.

**Host metadata** (never mixed into authenticity): known vs unknown number, high-value transfer, call origin. Unknown / first-time callers can raise the fraud score slightly.

TypeScript hosts can use `apps/web/src/sdk`. Flutter / Kotlin / Swift should speak this HTTP/WS contract directly — there is no published Dart package yet; the contract is the SDK.

---

## 5. How this maps to Truecaller (problem-statement story)

SIH26104: *API / SDK so existing platforms can detect clone + scam during a call.*

Truecaller (or Jio, a bank IVR, a contact-centre) already owns:

- the call path,
- caller ID / spam reputation,
- the in-call UI.

They do **not** need VoxShield to place calls. They would:

1. Ask the user for analysis permission.
2. Stream call audio (or a mix-minus they already have inside their stack) to `WS /stream`.
3. Optionally send ASR text to `/score-text` for faster fraud.
4. Show VoxShield’s `verdict` on their existing banner.
5. Optionally auto-cut on `critical` (host policy).

We **do not** integrate with Truecaller’s production APIs. There is no public Truecaller “give me PCM of this GSM call” SDK. For SIH, the Flutter app **stands in for Truecaller**.

```
Production later                         SIH demonstration
─────────────────                        ─────────────────
Truecaller in-call UI                    Flutter “Truecaller-like” UI
        │                                         │
        │  WS /stream + /score-text               │  same contract
        ▼                                         ▼
   VoxShield Core                            VoxShield Core
```

Judges should hear: *“We built the detection layer those apps would call, and a host that already calls it.”*

---

## 6. Flutter host — end-to-end demo that will actually work

A Flutter app similar to Truecaller is the **right** demo if it is treated as a **host adapter**, not as a second detection engine.

### 6.1 Recommended architecture for demo day

```
Phone (Flutter)
  incoming-call chrome, timer, warn banner, Hang up
  record mic @ 16 kHz PCM16
  optional on-device speech_to_text → POST /score-text
  WebSocket to Core
        │
        │  same Wi‑Fi / ngrok / Render
        ▼
Laptop (or Render) running uvicorn on :8000
  VoxShield Core  (profile=full or lite)
```

**Minimum Flutter work**

1. Call-style UI (unknown CLI, “Protecting…”, verdict banner).
2. `GET /health` before connecting (wait if `warming: true`).
3. `WS /stream` with PCM16 as above.
4. Map `verdict` → copy (`fraud_human` → hang up / don’t share OTP; `critical` → clone + scam).
5. Pass `unknown_number` / `known_contact` from the fake phonebook.

Do **not** reimplement lexicon or neural models in Dart.

### 6.2 “Real calls” — be precise or the demo fails

Android and iOS **do not** give third-party apps the far-end PCM of a normal GSM / WhatsApp / Truecaller call. That is a platform restriction, not a VoxShield gap.

| Demo method | Authenticity | Fraud | Looks like a “real call”? | Use on stage? |
|---|---|---|---|---|
| **A. Flutter is the call** (both people in your VoIP / same-room mics) | Yes | Yes | Yes, as *your* dialler | **Primary** |
| **B. PSTN/WhatsApp on speaker + Flutter records the mic** | Mixed, noisy, replay-like | Yes if speech is captured | Looks real | Backup; warn about speaker distortion |
| **C. File upload `POST /analyze`** of a recorded call | Best for clones | Yes | Less live | Safety net |
| **D. Captions only `/score-text`** | No | Yes | Partial | Fraud-only if audio capture fails |
| **E. Hook real Truecaller / WhatsApp audio** | — | — | — | **Not feasible** on stock phones |

For SIH, **A + C** is the honest end-to-end path. “We intercepted a live Truecaller GSM call” will fail in the hall.

**Clone test that still reads as a phone call:** play the clone from phone 1 on speaker; Flutter on phone 2 (or the laptop Call adapter) streams the mic. That is the same replay channel [ENGINE.md](./ENGINE.md) already designs for.

### 6.3 Demo script (keep it short)

1. Health green on the Flutter app.
2. **Human + scam script** (“share the bank OTP / transfer 50 hazaar”) → `fraud_human`.
3. **Human + Hotstar OTP** → stay `clear` (family login, not a harvest).
4. **Clone of a teammate** (file or speaker) asking for OTP → `critical` or high authenticity.
5. Point at `/operations` curl: same Core, different host.

Engine must be **warmed** (`GET /health` → `ready: true`) before the first live connect. First-ever run downloads ~1 GB.

### 6.4 What the Flutter teammate needs from this repo

- This file + [ENGINE.md](./ENGINE.md) §7 JSON shape.
- Base URL: `http://<laptop-LAN-ip>:8000` (Android emulator uses `10.0.2.2:8000`).
- Header `X-API-Key` on REST; `?api_key=` on the WebSocket URL (same value as `VOXSHIELD_API_KEY`).
- CORS does not apply to Flutter’s native HTTP client; `ALLOWED_ORIGINS` is for the **web** adapter.
- Keep the laptop awake; free cloud sleeps kill WebSockets.

---

## 7. Data flow (one live window)

```
Host mic / file
    → 16 kHz mono
        → Stage 1 DSP (+ neural on full ticks)
        → Stage 2 Whisper (full ticks) and/or host captions
        → SilverGuard + intent lexicon + amounts
        → fusion.verdict
    → JSON to host UI (two rings, evidence terms, action)
```

Privacy: the analysing process sees audio in RAM; we do not write call recordings. Hosts must say that in their permission prompt.

---

## 8. What we are not (v1)

- A published Flutter/Kotlin SDK on pub.dev / Maven (the **contract** is the SDK).
- gRPC, signed webhooks, Truecaller/WhatsApp/Meet plugins.
- Core-banking or carrier SIP/RTP ingest.
- Training a new anti-spoof model.
- A public voice-cloning product.

---

## 9. Where to read next

| Document | Contents |
|---|---|
| [ENGINE.md](./ENGINE.md) | Signals, weights, thresholds, response JSON |
| [PRD.md](../PRD.md) | Personas, SIH traceability, non-goals |
| [README.md](../README.md) | How to run Core + web |
| `apps/web/src/sdk/index.ts` | Exact TypeScript client |
| `apps/api/main.py` | Endpoint implementations |
