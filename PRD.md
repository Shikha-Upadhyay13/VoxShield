# VoxShield — Product Requirements Document

**Project:** VoxShield – AI-Powered Real-Time Voice Clone & Financial Scam Detection  
**Hackathon:** Smart India Hackathon 2026  
**Problem Statement ID:** SIH26104  
**Title:** AI-Powered Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks  
**Organization:** All India Council for Technical Education (AICTE) — Cyber Security Cell  
**Category:** Software  
**Theme:** Blockchain & Cybersecurity  
**Document status:** Phase 0 — Spec (approved product source of truth)  
**Last updated:** 11 September 2026

This document is the single source of truth for what we build, in what order, and why. Implementation starts only after the matching phase exit criteria are met. Do not start Phase 4 UI chrome until Phase 3 separates a teammate’s real voice from our demo clone.

---

## 1. Vision

VoxShield is a voice-integrity layer for live and near-live calls. While a conversation is still happening, it answers two questions:

1. How likely is this voice AI-generated or cloned?
2. What should the listener do *right now* so money or secrets are not released?

It is not a forensic lab tool that reports after the fraud. It is a scored, explainable warning that arrives in time to stop the transfer.

The official SIH gap is the absence of this layer in telephony, VoIP, and enterprise collaboration. Conventional checks — caller ID, manual call-back culture, and “I know that voice” — fail when the voice itself is the exploit.

---

## 2. Problem, understood to the core

### 2.1 What actually happens in the attack

Voice cloning is no longer a research demo. A few seconds of audio — a WhatsApp status, a YouTube clip, a leaked call — is enough to synthesize a trusted voice. The attack is not “a robot that sounds robotic.” It is:

**Familiar voice + urgency + a request that would be refused from a stranger.**

Typical kill chain:

1. Attacker harvests a short genuine sample of a CXO, official, parent, or child.
2. A neural TTS / voice-conversion model clones the speaker.
3. The clone is played over a mobile call, VoIP, or collaboration meeting, often with leaked personal details to make the story airtight.
4. The victim is put under time pressure: send money, share an OTP, approve a transfer, do not tell anyone.
5. Traditional verification fails because the one signal people trust — the voice — has been forged.

### 2.2 Two victims, one engine

| Persona | Example line | Why they comply |
|---|---|---|
| Family / retail | “Beta, I’m in trouble. Send money to this UPI now.” | Love, fear, and voice familiarity. Caller ID can be spoofed. |
| Bank / enterprise / government | “This is the CFO. Approve the transfer. Do not call anyone.” | Hierarchy, urgency, and fear of delaying a senior. |

SIH26104 is written for institutions. Indian reality is also family fraud. VoxShield serves both from one detection engine and two UI modes.

### 2.3 Why existing controls are not enough

- Caller ID and STIR/SHAKEN do not prove the *speaker*.
- Manual call-back is skipped under pressure.
- Human “that sounds like them” is exactly what clones are optimized to pass.
- Most commercial deepfake detectors are batch/file tools. They do not stream a risk score during the call, and they rarely explain *why*.
- Models trained only on ASVspoof 2019 often miss modern clones (XTTS, ElevenLabs-class TTS). A single black-box neural score is also brittle when audio is replayed phone-speaker → laptop mic.

### 2.4 The job to be done

While the person is still on the line:

- Compute a dynamic impersonation risk score.
- Show why the score moved (acoustic / prosody / context).
- Recommend a concrete next action before funds move or secrets leak.

---

## 3. Goals and non-goals

### 3.1 Goals (prototype must prove)

- Detect our team-generated AI clone of a teammate, on file upload, with a clearly higher score than the same person’s genuine speech.
- Run the same engine on live laptop-mic audio (phone playing the clone into the mic).
- Produce a 0–100 risk score every 1–2 seconds after the first viable window.
- Explain the score with per-layer contributions a judge can read in five seconds.
- Offer two modes: **Protect** (family) and **Operations** (bank / analyst).
- Default to no raw-audio retention (feature-only logging).
- Expose REST + WebSocket APIs so the product looks like a platform, not a one-off site.

### 3.2 Non-goals (explicitly out of v1)

- A public “clone anyone’s voice” feature. Dual-use and looks bad to judges. Clone kit is team-only under `demo/`.
- Training a new SOTA anti-spoofing model from scratch.
- Real core-banking, telecom-switch, or legal intercept integration.
- Guaranteed detection of every commercial TTS on earth.
- Long-term storage of call recordings.
- Blockchain in v1 (see Phase 5). Theme alignment is noted; implementation is deferred.
- Shipping a production mobile app. The prototype is a web app; phone is only the *playback* device for the live demo.

---

## 4. Locked product decisions

| Decision | Choice | Rationale |
|---|---|---|
| Client | Next.js (App Router) | Professional UI, fast to demo, one deployable web app |
| Backend | Python FastAPI | DSP, optional ML, WebSocket streaming |
| Capture | Browser `getUserMedia` + Web Audio | Laptop mic prototype; no native app required |
| Transport | REST for files, WebSocket for live chunks | Matches “near real time” in the PS |
| Users | Dual mode: Protect + Operations | Maps family story *and* official PS |
| Detection | Hybrid fusion (DSP + prosody + optional neural + context) | Explainable on stage; survives laptop constraints |
| Demo clone | Free local tool (Coqui XTTS-v2 or OpenVoice) | Show the real problem without a paid API |
| Blockchain | Deferred to Phase 5 | Get detection working first |
| Privacy default | No raw audio on disk | PS privacy module + judge-ready line |

---

## 5. Users and personas

### 5.1 Priya — family member (Protect mode)

Priya’s father appears to call from an unknown number. The voice is his. He asks for an urgent UPI transfer and says not to tell anyone. Priya is not a security expert. She needs plain language: “This voice may be AI-generated” and three actions she can take in the next thirty seconds.

### 5.2 Arjun — bank / contact-center analyst (Operations mode)

Arjun handles high-value phone instructions. He needs a live risk gauge, caller metadata, transaction context, and one-click actions: Hold, Request MFA, Escalate, or Allow with a reason. He must be able to tighten thresholds for privileged approvals.

### 5.3 Integration owner (API consumer)

VoxShield is **not** a standalone consumer app where people upload recordings. The product
is an embeddable detection layer for hosts such as Truecaller, bank diallers, CCaaS, or
carrier stacks:

1. The host requests permission to analyse the call.
2. While the call is live, audio (or features) stream into `WS /stream`.
3. VoxShield returns two scores + a verdict; the host shows an alert.
4. Future: the host can auto-cut or hold the call when the verdict is `critical`.

File upload (`POST /analyze`) exists for SIH demos, calibration, and offline QA — not as
the primary user journey. For SIH they need a documented `POST /analyze` and `WS /stream`
plus a sample `curl` on the Operations screen.

### 5.4 Judge / invigilator

Has 5–8 minutes. Must *hear* a real teammate, *hear* the clone of that teammate, *see* the score separate them, and *see* the recommended action. If the room is noisy, file upload of the same two clips is the safety net.

---

## 6. Official PS traceability

Every official Key Component maps to a VoxShield feature. This table is what evaluators should be walked through.

| SIH26104 Key Component | VoxShield response | Phase |
|---|---|---|
| Acoustic / spectral analysis for synthesis artifacts, phase inconsistency, spectral signatures | Layer 1 DSP: MFCC stats, centroid/rolloff, high-frequency cutoff, HNR, jitter/shimmer, residual/phase flatness | 3 |
| Prosody and behavioral analysis (rhythm, pitch, pauses, micro-variations) | Layer 2: pitch-contour variance, pause regularity, speaking-rate stability | 3 |
| Cross-session consistency vs historical genuine samples | Feature-vector voiceprint of teammate (no raw audio stored) | 5 (P2) |
| Continuous confidence / risk score during the conversation | Sliding-window fusion, 0–100, updated every 1–2 s | 3–4 |
| Configurable thresholds by scenario (high-value vs normal) | Operations threshold presets | 4 |
| Contextual enrichment (origin, known contact, transaction, fraud history) | Metadata panel + keyword / urgency flags | 4–5 |
| Multi-channel alerts (UI, SMS/email, in-app) | In-app banners in v1; SMS/email as mocked channels | 4 |
| Pre-transaction warnings (callback, MFA, supervisor) | Protect playbooks + Operations Hold / MFA / Escalate | 4 |
| Configurable workflows for banks, enterprises, government | Operations action bar + reason codes | 4 |
| Minimal retention; on-device / edge option | In-memory processing; feature-only logs; retention toggle | 4 |
| Anonymization / feature-only logging | Incident records store features + score + timestamp, not WAV | 4 |
| REST / gRPC APIs and SDKs | FastAPI REST + WebSocket in v1; gRPC/SDK listed as future | 4 |
| Indian languages and accents | Language-agnostic DSP; Whisper keyword pack EN + HI first | 3 / 5 |
| Expected outcome: fewer voice-clone frauds | Demo-measurable: clone flagged before “approve / send” | 3–4 |
| Expected outcome: trust in voice channels | Dual-mode UX + explainability | 4 |
| Expected outcome: early containment | Time-to-first-score target ≤ 3 s after speech starts | 3 |
| Theme: Blockchain & Cybersecurity | Immutable incident-hash audit stub | 5 only |

Expected outcomes in this PRD are demo-measurable, not slogans. See Section 15.

---

## 7. Product principles

1. **Detection first.** A beautiful dashboard that cannot separate real vs clone loses SIH.
2. **Explain, then alarm.** Every high score must show which layer moved.
3. **Act before money moves.** Alerts end in a verb: hang up, call back, hold, escalate.
4. **Privacy by default.** Raw audio dies with the process unless the operator explicitly enables a session recording for the demo.
5. **One engine, two faces.** Protect and Operations share scores; they do not fork models.
6. **Demo cannot fail on acoustics alone.** Live mic is the hero path; file upload is the safety net.
7. **No public clone factory.** We demonstrate the attack; we do not productize it.

---

## 8. Detection system design

> **Implementation contract:** [docs/ENGINE.md](docs/ENGINE.md) is the authoritative spec for
> the engine — exact model IDs, signal formulas, thresholds, and the JSON response shape.
> This section states the *design intent*. Where the two disagree on an implementation
> detail, ENGINE.md wins. Do not implement the engine from this section alone.

### 8.1 Two stages, two scores

Detection answers **two independent questions**, and keeps the answers separate:

| Stage | Question | Output |
|---|---|---|
| **Stage 1** | Is this voice synthetic or a real human? | `authenticity.score` 0–100 |
| **Stage 2** | Is this speech an attempt at fraud? | `fraud.score` 0–100 |

They are never blended into a single number. The reason is the case that matters most to a
bank: a **real human reading a scam script**. One merged score would dilute a 95 fraud
signal with a 10 authenticity signal into a meaningless mid-band "review" and lose the
attack entirely. Two scores plus an action matrix (Section 8.7) keeps that case visible.

### 8.1a Why hybrid fusion

Classic AASIST-style models trained on ASVspoof 2019 miss modern neural clones. Measured on
the [Podonos 2026 benchmark](https://github.com/podonos/audio-dfd-benchmark) against modern
commercial cloners: AASIST 48.2%, LCNN 50.0%, RawNet2 50.7%, Wav2Vec2 62.9%. Over-the-air
replay (phone speaker → room → laptop mic) adds channel distortion those detectors never
saw.

So v1 does **not** bet the demo on one neural score. It combines a diverse neural pair with
independent DSP evidence we can defend in a viva.

```
Mic stream / file upload
        │
        ▼
  Sufficiency gate (>= 1 s voiced, else insufficient_audio)
        │
        ├──────────────────────────────┐
        ▼                              ▼
  STAGE 1  synthetic?            STAGE 2  fraud?
        ├─► Neural pair (AST + wav2vec2)      ├─► Whisper transcript
        ├─► DSP / prosody signals             ├─► SilverGuard scam classifier
        └─► Disfluency absence                ├─► Weighted lexicon
                │                             └─► Amount extraction
                ▼                                      │
     authenticity.score 0–100                  fraud.score 0–100
                └──────────────┬───────────────────────┘
                               ▼
                        Action matrix
                               ▼
              verdict + reasons + alerts + playbooks
```

### 8.2 Inputs

| Input | Use | Reliability |
|---|---|---|
| File upload (WAV/MP3/M4A, 16 kHz preferred) | Primary evaluation path; judge safety net | Highest — digital clone artifacts intact |
| Live laptop mic via WebSocket chunks | Hero demo (phone plays clone) | Lower — replay channel; still required |
| Demo clips in `demo/audio/` | Side-by-side real vs clone | Controlled |

Minimum speech for a first score: ~1.0 s of voiced audio. Silence and near-silence must return `insufficient_audio`, not a guess.

### 8.3 Stage 1a — DSP / prosody (P0, always on)

Language-agnostic. This is how we cover Indian languages without a Hindi-only acoustic model.
Exact formulas and weights: [ENGINE.md Section 3.2](docs/ENGINE.md).

The signals, and what each one is testing:

| Signal | Hypothesis |
|---|---|
| Pitch stability | Synthetic speech is monotone; F0 std-dev is low |
| **Jitter** | Cycle-to-cycle F0 perturbation is near zero — human vocal folds are never that stable |
| **Shimmer** | Cycle-to-cycle amplitude perturbation is near zero |
| Pause regularity | TTS pause grids are metronomic; human gap durations vary |
| HF cutoff | Neural vocoders leave a brick wall below ~7 kHz |
| Spectral flatness | Residual is noise-like, or over-smoothed |
| Breath | Most TTS omits inhalation between clauses |

Jitter and shimmer are the strongest signals on clean audio and the **weakest after
phone-speaker replay**, because the replay channel adds its own perturbation. This is why
the `replay/` calibration set in Section 13 is mandatory, not optional.

CPU-only, `numpy` + `scipy` only. No `librosa`, no `pyworld` — F0 is autocorrelation-based
in our own code so we control latency and can explain it in a viva.

### 8.4 Stage 1b — Neural pair (P0)

Two models with **different architectures**, so their errors are less correlated:

| Role | Model | Arch |
|---|---|---|
| Primary | `MattyB95/AST-ASVspoof5-Synthetic-Voice-Detection` | AST (spectrogram transformer) |
| Cross-check | `MelodyMachine/Deepfake-audio-detection-V2` | wav2vec2 (waveform SSL) |

Both load with plain `transformers`, run on CPU, need no `fairseq`, and install on Windows.
They also label their classes in opposite orders (`0=Bonafide` vs `0=fake`), so neither
order is hardcoded; both are read from `config.id2label` at load time.

The AST model reports 0.859 recall on ASVspoof5 validation, meaning it misses about one
spoof in seven on its own training distribution. That is the reason the neural layer
carries only 0.55 of the Stage 1 weight instead of standing alone.
When they disagree by more than 0.5, confidence drops and DSP dominates rather than
averaging two contradictory opinions into false certainty.

`nii-yamagishilab/wav2vec-large-anti-deepfake` has better published numbers but needs
`fairseq`, which does not build on Windows, and is non-commercial. Documented as a
Linux-only upgrade; **never a Phase 3 exit dependency.**

### 8.5 Stage 1c — Disfluency absence (P0)

Count `umm / uh / ah / hmm / matlab / haan` in the transcript. Natural conversational
speech has them; scripted TTS does not. Requires at least 25 words to judge, and is
**corroborating evidence only** — a human reading aloud also has no disfluencies, so this
signal can never be the sole basis for a high band.

### 8.6 Stage 2 — Fraud detection (P0)

Runs on the Whisper transcript, independent of Stage 1:

- `tanishqmudaliar/SilverGuard` — MIT-licensed MobileBERT ONNX (24M params) already trained
  on Indian scam archetypes: digital arrest, KYC freeze, OTP fraud, RBI/TRAI impersonation,
  courier scams, investment fraud. Weight 0.45.
- **Weighted lexicon** — six auditable categories: credentials, coercion, secrecy, urgency,
  money, authority, in English and Hindi/Hinglish. Weight 0.40. Two or more categories is
  the meaningful signal; a lone `money` hit is ordinary conversation.
- **Amount extraction** — digits plus `hazaar / lakh / crore`, escalating by size. Weight
  0.15. The figure is surfaced in the alert ("demanded ₹50,000"), which persuades a
  non-technical victim far better than a score does.

Context metadata (unknown number, first-time caller, high-value transaction) continues to
feed the Operations view.

Whisper output is used for scoring and display only. Do not persist full transcripts by
default.

### 8.7 Fusion, bands, and the action matrix

Every signal emits a 0–1 suspicion and a short reason string. Signals that cannot be
computed return `null` and their weight is redistributed — never substituted with a guess.

**Stage 1 weights:** neural 0.55, DSP 0.30, disfluency 0.15.
**Stage 2 weights:** classifier 0.45, lexicon 0.40, amount 0.15.

Bands, per score (the two scores use different thresholds because the cost of a false
positive differs):

| Preset | Authenticity review / high | Fraud review / high |
|---|---|---|
| `standard` | 40 / 70 | 35 / 65 |
| `high_value` | 30 / 55 | 25 / 50 |

**The action matrix** turns the two scores into one decision:

| Authenticity | Fraud | Verdict | Protect copy | Operations action |
|---|---|---|---|---|
| High | High | `critical` | “This voice may be AI-generated and is asking for money or codes. Do not send anything.” | Hold + escalate |
| Low | High | `fraud_human` | “This caller is using scam tactics. Hang up and call back on a saved number.” | Hold + escalate |
| High | Low | `synthetic_benign` | “This voice looks synthetic but is not asking for anything. Stay alert.” | Flag, monitor |
| Review either | — | `review` | “Something is off. Call them back on a saved number before you send money.” | Warn + request MFA |
| Low | Low | `clear` | “Voice looks consistent with a human speaker. Stay alert.” | Monitor |

`fraud_human` is the row that makes VoxShield useful to a bank rather than a novelty: a
live social engineer with a genuine voice is still an attack, and a single blended score
would have hidden it.

All thresholds live in `apps/api/calibration.json` and are overridable without code changes.

### 8.8 Cross-session voiceprint (P2)

Store a compact feature vector from a teammate’s *genuine* enrollment clip. At runtime, compare live features to that vector. Large identity drift plus synthetic cues is a stronger High than synthetic cues alone.

Store the vector, never the enrollment WAV, unless the demo retention toggle is on.

### 8.9 Privacy in the engine

- Process windows in memory.
- Default incident log: `{timestamp, score, band, layer_scores, reasons[], duration_ms, mode}` — no audio bytes.
- Optional “Keep session audio for this demo only” toggle, off by default, wiped on refresh.
- No third-party audio upload in v1.

---

## 9. Functional requirements

Priority: **P0** must ship for a credible SIH demo. **P1** ships if Phase 3 is green. **P2** is hardening.

### 9.1 Capture and session

| ID | Req | Priority | Phase |
|---|---|---|---|
| C1 | User can grant mic access and see a live input meter | P0 | 2 |
| C2 | Audio streamed to backend as 16 kHz mono PCM/WAV chunks over WebSocket | P0 | 2–3 |
| C3 | User can upload WAV/MP3/M4A and run the same engine | P0 | 2–3 |
| C4 | User can play bundled demo clips: teammate real vs teammate clone | P0 | 2 |
| C5 | Waveform (and spectrogram if cheap) rendered during capture | P0 | 2 |
| C6 | Sessions can be started / stopped; stop flushes final score | P0 | 3 |
| C7 | `insufficient_audio` when speech is too short or silent | P0 | 3 |

### 9.2 Detection and scoring

| ID | Req | Priority | Phase |
|---|---|---|---|
| D1 | Stage 1 DSP signals (pitch, jitter, shimmer, pauses, HF cutoff, flatness, breath) computed per window | P0 | 3 |
| D2 | Stage 1 neural pair (AST + wav2vec2) scored per window, with disagreement reported | P0 | 3 |
| D3 | **Two separate scores** returned — `authenticity` and `fraud` — never merged | P0 | 3 |
| D4 | On our own clips, separation `min(clone ∪ replay) − max(real) ≥ 25` points | P0 | 3 |
| D5 | Live path uses the same engine as upload | P0 | 3 |
| D6 | Time-to-first-score ≤ 3 s after voiced audio begins (laptop, CPU) | P0 | 3 |
| D7 | Every signal returns value, suspicion, and a plain-English reason | P0 | 3 |
| D8 | Neural layer skippable via profile; DSP-only still answers | P0 | 3 |
| D9 | Stage 2: transcript + SilverGuard + lexicon + amount extraction (EN + HI) | P0 | 3 |
| D10 | Action matrix derives `verdict`, including `fraud_human` for a real human running a scam | P0 | 3 |
| D11 | Label-polarity verified during calibration so an inverted model cannot flip the verdict | P0 | 3 |
| D12 | Scam category naming (zero-shot NLI), feature-flagged | P1 | 5 |
| D13 | Voiceprint compare against enrolled genuine vector | P2 | 5 |

### 9.3 Alerts and playbooks

| ID | Req | Priority | Phase |
|---|---|---|---|
| A1 | In-app banner when band is Review or High | P0 | 4 |
| A2 | Protect playbook: hang up, call back on a saved number, never UPI/OTP under pressure, report | P0 | 4 |
| A3 | Operations actions: Hold, Request MFA, Escalate, Allow with reason | P0 | 4 |
| A4 | Threshold presets: Standard vs High-value transfer | P0 | 4 |
| A5 | Mock SMS / email alert preview (not a real gateway required) | P1 | 4 |
| A6 | Trusted contacts list (seed demo data) in Protect | P1 | 4 |

### 9.4 Privacy, API, i18n

| ID | Req | Priority | Phase |
|---|---|---|---|
| Pv1 | Default: do not persist raw audio | P0 | 4 |
| Pv2 | Feature-only incident history | P0 | 4 |
| Pv3 | `GET /health`, `POST /analyze`, `WS /stream` | P0 | 1 / 4 |
| Pv4 | OpenAPI snippet + sample `curl` on Operations | P0 | 4 |
| Pv5 | UI in English; Hindi strings for Protect alerts | P1 | 5 |
| Pv6 | Blockchain incident-hash stub | P2 | 5 |

---

## 10. Information architecture and UI

Visual language: dark security-ops. Not a consumer toy, not a neon cyberpunk poster. Live waveform, risk ring, per-layer bars, call timeline. Typography and spacing should look like a product a bank could white-label.

### 10.1 Routes

| Route | Mode | Purpose |
|---|---|---|
| `/` | Shared | Landing: 20-second problem story, Start live check, Upload audio, mode switch |
| `/monitor` | Shared | Live Monitor — mic, rolling risk, layer breakdown, timeline |
| `/analyze` | Shared | Upload / demo-clip analysis |
| `/protect` | Protect | Plain-language result + playbooks + trusted contacts |
| `/operations` | Operations | Analyst console, metadata, thresholds, actions, API panel |
| `/incidents` | Shared | Session history (scores, not recordings) |

Mode persists in local state. Switching mode never re-runs detection; it re-skins the last score into the right actions.

### 10.2 Landing

- One sentence problem: trusted voices can be faked; money moves before anyone doubts the voice.
- Two CTAs: **Start live check**, **Upload audio**.
- Mode toggle: Protect | Operations.
- Small “How it works” of the four layers (no academic dump).

### 10.3 Live Monitor

- Mic permission + input level.
- Risk ring 0–100 with band color.
- Four layer bars + reason chips.
- Timeline sparkline of score vs time.
- “Why this score” panel (plain language).
- Stop session → persist feature-only incident.

### 10.4 Protect

- Headline in human language, not “EER” or “ spoof posterior.”
- Checklist playbook (Section 9.3 A2).
- Trusted contacts (demo): call back on the number *you* saved, not the inbound CLI.

### 10.5 Operations

- Caller metadata mock: CLI, KYC name, whether CLI matches enrolled contact, transaction type, amount.
- Threshold preset switch.
- Action bar: Hold / MFA / Escalate / Allow.
- API key placeholder + `curl` for `POST /analyze`.

### 10.6 Incidents

Table: time, mode, duration, final score, band, actions taken. Click → layer breakdown. No audio player unless demo retention was on.

---

## 11. API sketch (v1)

Base URL (local): `http://127.0.0.1:8000`

> The **exact, field-for-field response contract** is
> [ENGINE.md Section 7](docs/ENGINE.md). The shape below is abridged for orientation.
> `apps/web/src/lib/types.ts` must match ENGINE.md, not this section.

### 11.1 `GET /health`

```json
{
  "status": "ok",
  "profile": "full",
  "engine_version": "1.0",
  "models": { "ast": true, "w2v2": true, "whisper": true, "silverguard": true }
}
```

### 11.2 `POST /analyze`

Multipart `file`, with optional `preset`, `language`, and `context`.

Response — **two independent scores plus a derived verdict**:

```json
{
  "status": "ok",
  "verdict": "critical",
  "confidence": 0.81,
  "authenticity": {
    "score": 88, "band": "high", "label": "Likely AI-generated", "degraded": false,
    "components": { "neural": { "score": 0.91 }, "dsp": { "score": 0.82 }, "disfluency": { "score": 0.90 } },
    "signals": [
      { "key": "jitter", "value": 0.21, "unit": "%", "suspicion": 0.93,
        "reason": "Cycle-to-cycle pitch variation is far below the human range." }
    ]
  },
  "fraud": {
    "score": 91, "band": "high", "label": "Fraud indicators present",
    "components": {
      "classifier": { "score": 0.88 },
      "lexicon": { "score": 0.93, "categories": ["credentials", "coercion"] },
      "amount": { "score": 0.8, "detected_inr": 50000 }
    }
  },
  "meta": { "window_ms": 3000, "latency_ms": 412, "retention": "features_only" }
}
```

Silence and near-silence return `{"status": "insufficient_audio"}` with **no scores at all**.

### 11.3 `WS /stream`

Client sends binary PCM frames (16 kHz, mono, 16-bit) or JSON `{ "type": "pcm16", "data": "<base64>" }`.  
Server sends the same object as `/analyze`, plus `{ "t_ms": 4200, "partial": true }`.

### 11.4 Later (not v1)

gRPC, signed webhooks, official JS/Python SDKs, telecom SIP/RTP ingest.

---

## 12. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind |
| Charts / audio viz | Lightweight canvas waveform; no heavy BI kit |
| Backend | Python 3.11.9, FastAPI, Uvicorn |
| DSP | `numpy` + `scipy` only (no librosa — own autocorrelation F0) |
| Audio decode | `soundfile` for wav/flac; **PyAV** for webm/opus from the browser, and mp3/m4a. No `ffmpeg` binary required — it is not installed on the demo laptop |
| STT | `faster-whisper`, `small`, `compute_type="int8"`, CPU |
| Stage 1 neural | `MattyB95/AST-ASVspoof5-Synthetic-Voice-Detection` + `MelodyMachine/Deepfake-audio-detection-V2` (plain `transformers`, CPU, no fairseq) |
| Stage 2 classifier | `tanishqmudaliar/SilverGuard` (MIT, MobileBERT ONNX, `onnxruntime`) |
| Realtime | WebSocket (FastAPI WebSocket) |
| State (prototype) | In-memory + JSON file for incidents; no cloud DB required |
| Demo clone | **noiz.ai** (free tier), generated by the team |
| Hosting | Next.js on Vercel free tier; engine local via `uvicorn`. HF Docker Spaces are now paid, so free API hosting there is unavailable |

Model weights cache to `apps/api/.models/` (gitignored). Full profile is ~1 GB;
`lite` profile is ~450 MB; `dsp_only` needs no downloads at all.

Repo layout (from Phase 1):

```
VoxShield/
  PRD.md
  README.md
  apps/web/          # Next.js
  apps/api/          # FastAPI
  demo/              # team-only clone kit notes + audio (gitignored if large)
```

---

## 13. Demo attack kit (team only)

Purpose: show the invigilator the *real* problem with a teammate’s voice, then detect it.

1. Record 10–15 seconds of one teammate in a quiet room, 16 kHz or 44.1 kHz WAV, no music, no crosstalk.
2. Clone with **noiz.ai** (free tier). Same sentence content is fine; different content is better for honesty. At least one clone clip should read a scam script so Stage 2 has something to catch.
3. File the clips into three folders:

```
demo/audio/real/     genuine recordings of the teammate     (>= 3 clips)
demo/audio/clone/    noiz.ai clones, downloaded digitally   (>= 3 clips)
demo/audio/replay/   clone played from a phone speaker into the laptop mic
```

4. **The `replay/` set is mandatory, not optional.** The live demo plays the clone through a
   phone speaker 20–40 cm from the laptop mic. That channel band-limits the audio, adds room
   reverb, and shifts every DSP signal — jitter and shimmer most of all. Thresholds
   calibrated only on clean downloads will look perfect in testing and fail in the hall.
5. Run `python calibrate.py` and record the real separation number in the README. If
   separation is under 25 points, fix signals or clips — do not tune thresholds to hide it.
6. `demo/audio/` is gitignored. Do not commit voices, model weights, or a public clone UI.
7. Live demo: play the clone from a phone speaker 20–40 cm from the laptop mic. If the hall
   is loud, use the upload path.

We do **not** ship a product feature that clones third-party voices.

---

## 14. Live demo script (5–8 minutes)

1. **Landing (30 s).** One sentence problem. Switch visible: Protect | Operations.
2. **Genuine (90 s).** Teammate speaks live into the laptop. Score stays in Genuine. Layers stay calm.
3. **Clone (90 s).** Phone plays the clone of the same person. Score climbs into Review/High. Reason chips light up.
4. **Protect (60 s).** Switch mode. Read the playbook out loud: hang up, call back on a saved number, no UPI.
5. **Operations (60 s).** Hold transfer + Escalate. Show high-value threshold preset.
6. **Platform (30 s).** `POST /analyze` curl / OpenAPI snippet.
7. **Safety net.** If live mic is noisy, upload `real_*.wav` then `clone_*.wav` and show the gap.

Backup order if time is cut: steps 3 (upload) → 4 → 5.

---

## 15. Success metrics (demo-measurable)

| Metric | Target |
|---|---|
| Time-to-first-score after voiced audio | ≤ 3 s |
| Genuine teammate clips | every clip in `genuine` authenticity band |
| noiz.ai clone clips | every clip in `high` authenticity band |
| Phone-speaker replay clips | every clip in `review` or `high` |
| Separation | `min(clone ∪ replay) − max(real) ≥ 25` points |
| Scam script | `fraud.score` in `high`, with the demanded amount extracted correctly |
| Real human reading a scam script | `verdict` = `fraud_human`, not `clear` |
| False guess on silence | never; return `insufficient_audio` |
| Raw audio default | not written to disk |
| Judge comprehension | can state “this voice may be fake” and one next action without a primer |

These are measured by `python calibrate.py`, and **the number we quote publicly is whatever
it reports on our own clips** — not the published benchmark figures of the underlying
models. An honest 78% we can explain beats a borrowed 99% that collapses under a question.

---

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Zero-shot models miss our noiz.ai clone** (measured: free detectors score 48–63% on modern cloners) | Two diverse architectures + independent DSP + disfluency; calibrate on our own clips and find out early, not on stage |
| Live replay evades digital-only detectors | DSP always on; mandatory `replay/` calibration set; upload safety net |
| Replay channel weakens jitter/shimmer | Weighted among seven signals, never decisive alone |
| Inverted model labels silently flip the verdict | `calibrate.py` verifies label polarity and fails loudly (D11) |
| Demo laptop too weak for Whisper + neural | `lite` and `dsp_only` profiles; CPU DSP is the floor |
| `fairseq` will not build on Windows | Best-published model (AntiDeepfake) excluded from the default path; never a Phase 3 dependency |
| False alarm on a teammate with a headset / cold | Calibrate on *our* genuine files; sufficiency gate |
| Hall noise during judging | File-upload path rehearsed first |
| Python engine not running during demo | Web app degrades to the in-browser scorer, clearly labelled as fallback |
| HF Docker Spaces now paid | Engine runs locally; on-device processing is a genuine privacy selling point |
| Dual-use optics | No public cloner; kit stays in `demo/` |
| Scope creep (blockchain, gRPC, SMS gateways) | Frozen behind Phase 3 exit |
| Accidental commit of home-directory git | VoxShield is its own repo; never use `C:\Users\Shikha` as root |

---

## 17. Phase plan and exit criteria

### Phase 0 — Spec (this document)

**Build:** `PRD.md`, `README.md`, GitHub repo seeded.  
**Exit:** Documents on `https://github.com/Shikha-Upadhyay13/VoxShield`. No application code required.

### Phase 1 — Skeleton

**Build:** Next.js app shell with dual-mode nav and dark professional theme. FastAPI `GET /health`. Empty Live Monitor layout.  
**Exit:** `web` and `api` run locally. Landing renders. Health returns ok.

### Phase 2 — Capture

**Build:** Mic streaming UI, file upload, demo-clip playback, waveform. No detection yet.  
**Exit:** Mic level moves. Upload plays back. Real and clone demo files can be loaded from disk.

### Phase 3 — Detection MVP (the core)

**Build:** Layer 1 + Layer 2 + fusion. `/analyze` and live chunk scoring. Reason strings.  
**Exit (gate):** On our demo files, real vs clone separate per Section 15. Same engine wired to live chunks. **Do not start Phase 4 until this is true.**

### Phase 4 — Product layer

**Build:** Thresholds, in-app alerts, Protect playbooks, Operations hold-flow, incidents, privacy defaults, REST docs + curl panel.  
**Exit:** Full demo script (Section 14) can be rehearsed without apology.

### Phase 5 — SIH hardening (only if Phase 3 is solid)

**Build:** Whisper keywords, voiceprint compare, optional neural layer, Hindi Protect copy, blockchain incident-hash stub.  
**Exit:** Nice-to-haves landed; nothing here unblocks the demo.

---

## 18. Phase 4 / 5 backlog (do not pull forward)

- Real SMS/email providers
- gRPC + published SDKs
- SIP/RTP or Teams/Zoom tap
- Production auth and multi-tenant orgs
- Blockchain audit chain (hash of feature-only incident)
- Training our own anti-spoof net
- Public voice-cloning UI

---

## 19. Open questions (non-blocking)

- Final teammate whose voice is enrolled for the clone kit.
- Whether the demo laptop can load Whisper-small; if not, keyword layer stays mocked until Phase 5.
- Hindi copy review by a native speaker on the team.
- Whether judges’ machines will run our stack or we present from one team laptop (assume one team laptop).

---

## 20. Document control

| Version | Date | Notes |
|---|---|---|
| 0.1 | 11 Sep 2026 | Phase 0 PRD. Stack, dual mode, hybrid detection, phases, demo script frozen. Blockchain deferred. |
| 0.2 | 12 Sep 2026 | Phase 3. Detection reworked to **two independent scores** (authenticity + fraud) with an action matrix. Clone tool changed to noiz.ai. Exact models named. `librosa` dropped. Engine contract extracted to [docs/ENGINE.md](docs/ENGINE.md). |

Changes to P0 requirements or Phase 3 exit criteria need a team decision, not a silent edit.

### Where to look for what

| Question | File |
|---|---|
| What is the product, who is it for, what ships when | This file |
| Exact models, formulas, thresholds, JSON contract | [docs/ENGINE.md](docs/ENGINE.md) |
| How to install and run it | [README.md](README.md) |

If any two of these disagree about the engine, **ENGINE.md is correct** and the other is a
bug to fix.
