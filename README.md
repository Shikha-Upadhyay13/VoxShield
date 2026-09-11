# VoxShield

**AI-powered real-time detection of voice-cloning impersonation attacks.**

Smart India Hackathon 2026 · Problem Statement **SIH26104**  
Organization: AICTE — Cyber Security Cell · Theme: Blockchain & Cybersecurity

VoxShield scores a live or uploaded voice for synthetic / cloned speech and tells the listener what to do before money or secrets move. One detection engine, two faces: **Protect** (family) and **Operations** (bank / enterprise).

## Current phase

**Phase 1–2 UI + preview engine.** Full product surface is in `apps/web`. Detection uses an in-browser DSP + prosody fusion so the console is usable without Python. The FastAPI engine (Phase 3) will replace this preview scorer.

Product requirements: **[PRD.md](./PRD.md)**.

## Run the UI

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Route | What you see |
|---|---|
| `/` | Landing |
| `/monitor` | Live mic, waveform, risk ring |
| `/analyze` | Upload + human/clone demo signals |
| `/protect` | Family playbooks + trusted contacts |
| `/operations` | Analyst console, hold/MFA, API snippet |
| `/incidents` | Feature-only history |

## Stack (locked)

| Layer | Choice |
|---|---|
| Web UI | Next.js (App Router) + TypeScript + Tailwind |
| Preview scoring | Client DSP (FFT + prosody + context flags) |
| API | Python FastAPI — Phase 3 |
| Capture | Browser mic (`getUserMedia`) + file upload |

## What we are not building in v1

- A public voice-cloning feature
- A from-scratch SOTA anti-spoof model
- Blockchain (deferred to Phase 5)
- Real core-banking or telecom-switch integration
