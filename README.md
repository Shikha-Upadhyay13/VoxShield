# VoxShield

**AI-powered real-time detection of voice-cloning impersonation attacks.**

Smart India Hackathon 2026 · Problem Statement **SIH26104**  
Organization: AICTE — Cyber Security Cell · Theme: Blockchain & Cybersecurity

VoxShield scores a live or uploaded voice for synthetic / cloned speech and tells the listener what to do before money or secrets move. One detection engine, two faces: **Protect** (family) and **Operations** (bank / enterprise).

## Current phase

**Phase 0 — Spec.** Product requirements are frozen in [PRD.md](./PRD.md). Application code starts in Phase 1.

Read the PRD before writing any feature. Phase 3 (real vs clone actually separates on our demo files) is the gate for UI polish.

## Stack (locked)

| Layer | Choice |
|---|---|
| Web UI | Next.js (App Router) + TypeScript |
| API | Python FastAPI |
| Capture | Browser mic (`getUserMedia`) + file upload |
| Detection | Hybrid fusion: acoustic DSP + prosody + optional neural + context |

## Repo

```
VoxShield/
  PRD.md          ← source of truth
  README.md
  apps/web/       ← Phase 1
  apps/api/       ← Phase 1
  demo/           ← team-only real vs clone clips (no public cloner)
```

## What we are not building in v1

- A public voice-cloning feature
- A from-scratch SOTA anti-spoof model
- Blockchain (deferred to Phase 5)
- Real core-banking or telecom-switch integration

## Team demo

1. Record a teammate (10–15 s, quiet room).
2. Clone locally with Coqui XTTS-v2 or OpenVoice (free).
3. Play the clone from a phone into the laptop mic — or upload the WAV if the hall is noisy.
4. Show the risk score, the layer reasons, then Protect playbooks and Operations hold/escalate.

Full script, API sketch, and phase exit criteria: **[PRD.md](./PRD.md)**.
