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

A future CBS / CCaaS / telecom integrator. For SIH they only need a documented `POST /analyze` and `WS /stream` plus a sample `curl` on the Operations screen.

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

### 8.1 Why hybrid fusion

Classic AASIST-style models trained on ASVspoof 2019 often miss modern neural clones. A 1 GB wav2vec checkpoint may not load on the demo laptop. Over-the-air replay (phone speaker → room → laptop mic) adds channel distortion that digital-only detectors were not trained on.

So v1 does **not** bet the live demo on one neural score. It fuses layers we can defend in a viva.

```
Mic stream / file upload
        │
        ▼
  Windowing (1–2 s, 50% overlap)
        │
        ├─► Layer 1  Acoustic / spectral DSP
        ├─► Layer 2  Prosody / behavior
        ├─► Layer 3  Optional neural anti-spoof (P1)
        └─► Layer 4  Context / keywords (P1 STT)
                │
                ▼
         Risk fusion (0–100)
                │
                ▼
    UI gauge + alerts + playbooks
```

### 8.2 Inputs

| Input | Use | Reliability |
|---|---|---|
| File upload (WAV/MP3/M4A, 16 kHz preferred) | Primary evaluation path; judge safety net | Highest — digital clone artifacts intact |
| Live laptop mic via WebSocket chunks | Hero demo (phone plays clone) | Lower — replay channel; still required |
| Demo clips in `demo/audio/` | Side-by-side real vs clone | Controlled |

Minimum speech for a first score: ~1.0 s of voiced audio. Silence and near-silence must return `insufficient_audio`, not a guess.

### 8.3 Layer 1 — Acoustic / spectral (P0, always on)

Language-agnostic. This is how we cover Indian languages without a Hindi-only acoustic model.

Extract at least:

- MFCC mean / variance / skew (first 13–20 coefficients)
- Spectral centroid, bandwidth, rolloff
- High-frequency energy cutoff / vocoder brick-wall tell
- Harmonic-to-noise ratio (HNR)
- Jitter and shimmer (cycle-to-cycle instability; clones are often *too* stable or *unnaturally* unstable)
- Residual / phase flatness or equivalent DSP proxy

Implementation note: `librosa` + `scipy` + a small pitch tracker (e.g. `pyworld` or `librosa.pyin`). Keep this layer CPU-only and fast.

### 8.4 Layer 2 — Prosody / behavior (P0)

Neural TTS is often too even. Humans micro-vary.

- Pitch contour variance and range
- Pause regularity (synthetic pause grids vs human irregularity)
- Speaking-rate stability
- Energy envelope variance

### 8.5 Layer 3 — Neural anti-spoof (P1, optional)

Lightweight pretrained checkpoint only if it loads on the demo laptop (AASIST-L or a small wav2vec anti-spoof). If GPU/RAM is tight, disable this layer. Fusion must still work from Layers 1 + 2 + 4.

Do not block Phase 3 exit on this layer.

### 8.6 Layer 4 — Context (P0 story, P1 STT)

- Call origin: unknown / spoofed / known contact (demo metadata)
- First-time vs enrolled speaker
- Transaction context: high-value transfer vs general inquiry (Operations)
- Urgency / social-engineering keywords after Whisper-small multilingual (EN + HI first): e.g. “send money”, “UPI”, “OTP”, “don’t tell anyone”, “abhi bhejo”, “kisi ko mat batana”

Whisper output is used for flags only. Do not persist full transcripts by default.

### 8.7 Fusion and thresholds

Each layer emits a 0–1 risk contribution and a short reason string.

Default weights (tunable in Operations):

| Layer | Default weight | Notes |
|---|---|---|
| Acoustic / spectral | 0.40 | Always on |
| Prosody | 0.30 | Always on |
| Neural | 0.20 | 0.00 if model unloaded; remaining mass renormalized |
| Context | 0.10 | Raises score; never the sole reason to hit High if audio is clean-genuine |

`score = 100 * clip(sum(weight_i * layer_i), 0, 1)`

Bands:

| Score | Band | Protect copy | Operations action |
|---|---|---|---|
| 0–39 | Genuine | “Voice looks consistent with a human speaker. Stay alert.” | Monitor |
| 40–69 | Review | “Some synthetic patterns. Call them back on a saved number before you send money.” | Warn + suggest callback / MFA |
| 70–100 | High risk | “This voice may be AI-generated. Do not transfer money or share OTPs.” | Hold + escalate |

High-value transaction preset (Operations): Review starts at 30, High at 55.

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
| D1 | Layer 1 DSP features computed per window | P0 | 3 |
| D2 | Layer 2 prosody features computed per window | P0 | 3 |
| D3 | Fusion produces 0–100 score + band | P0 | 3 |
| D4 | On held demo files, clone score ≥ 70 and genuine score ≤ 39, or a documented calibrated gap ≥ 30 points | P0 | 3 |
| D5 | Live path uses the same fusion as upload | P0 | 3 |
| D6 | Time-to-first-score ≤ 3 s after voiced audio begins (laptop, CPU) | P0 | 3 |
| D7 | Per-layer scores and one-line reasons returned with every score | P0 | 3 |
| D8 | Optional neural layer, skippable via config | P1 | 5 |
| D9 | Keyword / urgency flags (EN + HI) | P1 | 5 |
| D10 | Voiceprint compare against enrolled genuine vector | P2 | 5 |

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

### 11.1 `GET /health`

```json
{ "status": "ok", "model": { "dsp": true, "prosody": true, "neural": false } }
```

### 11.2 `POST /analyze`

Multipart file or JSON with a demo clip id.

Response:

```json
{
  "score": 82,
  "band": "high",
  "layers": {
    "acoustic": { "score": 0.84, "reasons": ["vocoder-like high-frequency cutoff"] },
    "prosody": { "score": 0.71, "reasons": ["unusually flat pitch variance"] },
    "neural": { "score": null, "reasons": ["layer disabled"] },
    "context": { "score": 0.40, "reasons": ["urgency keywords: send money"] }
  },
  "window_ms": 1600,
  "retention": "features_only"
}
```

### 11.3 `WS /stream`

Client sends binary PCM frames (16 kHz, mono, 16-bit) or JSON `{ "type": "pcm16", "data": "<base64>" }`.  
Server sends the same score object as `/analyze`, plus `{ "t_ms": 4200, "partial": true }`.

### 11.4 Later (not v1)

gRPC, signed webhooks, official JS/Python SDKs, telecom SIP/RTP ingest.

---

## 12. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind |
| Charts / audio viz | Lightweight canvas waveform; no heavy BI kit |
| Backend | Python 3.11+, FastAPI, Uvicorn |
| DSP | librosa, numpy, scipy |
| Optional STT | faster-whisper or openai-whisper `small` |
| Optional neural | AASIST-L or equivalent, feature-flagged |
| Realtime | WebSocket (`websockets` / FastAPI WebSocket) |
| State (prototype) | In-memory + JSON file for incidents; no cloud DB required |
| Demo clone | Coqui XTTS-v2 or OpenVoice, run locally by the team |

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
2. Clone with **Coqui XTTS-v2** or **OpenVoice** (free, local). Same sentence content is fine; different content is better for honesty.
3. Keep both files as `demo/audio/real_<name>.wav` and `demo/audio/clone_<name>.wav`.
4. Do not commit multi-GB model weights. Do not commit a public clone UI.
5. Live demo: play the clone from a phone speaker 20–40 cm from the laptop mic. If the hall is loud, use upload.

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
| Genuine teammate file | score ≤ 39, or ≥ 30 points below clone |
| Team XTTS/OpenVoice clone file | score ≥ 70, or ≥ 30 points above genuine |
| Live clone replay | score in Review or High in a quiet room |
| False guess on silence | never; return `insufficient_audio` |
| Raw audio default | not written to disk |
| Judge comprehension | can state “this voice may be fake” and one next action without a primer |

---

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Live replay evades digital-only detectors | DSP + prosody always on; upload safety net |
| Modern TTS evades ASVspoof-2019 neural nets | Do not depend on Layer 3 for Phase 3 exit |
| Demo laptop too weak for Whisper + neural | Feature-flag both; CPU DSP is the floor |
| False alarm on a teammate with a headset / cold | Calibrate on *our* genuine files; silence gate |
| Hall noise during judging | File-upload path rehearsed first |
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

Changes to P0 requirements or Phase 3 exit criteria need a team decision, not a silent edit.
