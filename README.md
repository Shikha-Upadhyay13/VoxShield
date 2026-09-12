# VoxShield

**AI-powered real-time detection of voice-cloning impersonation attacks.**

Smart India Hackathon 2026 · Problem Statement **SIH26104**
Organization: AICTE — Cyber Security Cell · Theme: Blockchain & Cybersecurity

VoxShield answers two questions about a voice on a call, and keeps the answers separate:

1. **Is this voice synthetic?** — a cloned voice
2. **Are these words a scam?** — the intent behind them

Both matter, and neither substitutes for the other. A cloned voice reading a shopping
list is harmless. A real human reading a scam script is the most common fraud there is,
and a single blended risk score gets that case wrong — it averages a low authenticity
score against a high fraud score into a meaningless "review". VoxShield reports two
scores and combines them through an explicit action matrix instead.

One engine, two faces: **Protect** (family) and **Operations** (bank / enterprise).

## Documentation

| Read this | For |
|---|---|
| **[docs/ENGINE.md](./docs/ENGINE.md)** | How detection actually works. Authoritative — where it and any other file disagree, it wins. |
| [PRD.md](./PRD.md) | Product requirements, scope, personas, roadmap |
| [demo/audio/README.md](./demo/audio/README.md) | What to record for calibration, and why the replay set is mandatory |

## Run it

Two processes: the Next.js UI and the Python engine. The UI runs without the engine, but
falls back to an in-browser scorer that has no neural models and cannot read the words at
all — it is clearly labelled as such on screen and is not the real product.

### Engine (Python 3.11, CPU only)

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
python selftest.py                # prove the wiring before downloading ~1 GB of models
uvicorn main:app --port 8000
```

The first request downloads about 1 GB of model weights into `apps/api/.models/`, which
takes a while. Weights are never committed.

No ffmpeg needed — decoding goes through PyAV, which also handles the browser's
webm/opus stream.

Set `VOXSHIELD_PROFILE` to trade accuracy for size:

| Profile | Size | What runs |
|---|---|---|
| `full` (default) | ~1 GB | Both neural detectors, whisper-small, scam classifier |
| `lite` | ~450 MB | One detector, whisper-base, scam classifier |
| `dsp_only` | 0 | Signal processing and lexicon only. No downloads. |

### UI

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Point it elsewhere with
`NEXT_PUBLIC_VOXSHIELD_API`.

## Verifying it works

```bash
cd apps/api
python selftest.py     # 26 wiring checks, no recordings needed
python calibrate.py    # measures accuracy against your own clips
python eval_fraud.py   # scores the fraud layer against a scam-message dataset
```

`selftest.py` proves the engine is wired correctly using synthesised tones. **It says
nothing about accuracy on real voices.** For that you need `calibrate.py` and your own
recordings — see [demo/audio/README.md](./demo/audio/README.md).

## Honesty about accuracy

We have not measured Stage 1 accuracy on real voices yet, so this README quotes no
authenticity number. When we do, it will be the number `calibrate.py` reports on our own
clips — see [demo/audio/README.md](./demo/audio/README.md).

Stage 2, against the public
[`karanverma19/Indian_Multilingual_Scam_Message_Dataset`](https://huggingface.co/datasets/karanverma19/Indian_Multilingual_Scam_Message_Dataset)
(120 Hindi/Hinglish/English SMS, 60 scam / 60 legit):

| Threshold | Role in VoxShield | Precision | Recall | F1 |
|---|---|---|---|---|
| 35 | `fraud.band = review` | 0.85 | 0.77 | 0.81 |
| 55 | best F1 on this set | 1.00 | 0.72 | 0.84 |
| 65 | `fraud.band = high` | 1.00 | 0.53 | 0.70 |

These are SMS messages, which is what SilverGuard was trained on. Live speech transcripts
are messier (Whisper drops words, no punctuation), so expect somewhat lower recall in the
product than the table shows. The smoke test on our own call scripts is 8/8 — that proves
wiring, not accuracy.

The reason for caution on Stage 1 is measurable. Free open-source deepfake-audio detectors
were trained on ASVspoof 2019 and perform close to chance against modern commercial voice
cloners — the [Podonos 2026 benchmark](https://github.com/podonos/audio-dfd-benchmark)
puts AASIST at 48% accuracy and RawNet2 at 51%, which is coin-flip territory. Our own
Stage 1 primary reports 0.859 recall on the data it was trained for, so it misses roughly
one spoof in seven even in-distribution.

VoxShield is designed around that limitation rather than pretending it away:

- **Two architectures** (AST + wav2vec2) so their errors are less correlated, and an
  explicit disagreement measure that lowers confidence instead of averaging two
  contradictory opinions into false certainty
- **Seven independent DSP signals** — pitch stability, jitter, shimmer, pause rhythm,
  high-frequency ceiling, spectral flatness, breath — that need no training and fail in
  different ways than the neural models
- **Calibration on our own clips**, including a replay set recorded through a phone
  speaker, because replay weakens the two signals we lean on hardest
- **Nothing is asserted without evidence.** A signal that cannot be measured in a given
  window returns `null` and its weight is redistributed, rather than guessing.

See [docs/ENGINE.md](./docs/ENGINE.md) Section 2 for the measured numbers and Section 12
for the full list of known limitations.

## Product surface

| Route | What you see |
|---|---|
| `/` | Landing |
| `/console` | Command center |
| `/monitor` | Live mic, dual gauges, signal breakdown |
| `/analyze` | Upload, full detection report, engine status |
| `/compare` | Human-like vs clone-like bench |
| `/protect` | Family playbooks + red flags |
| `/operations` | Analyst console, hold/MFA, API snippet |
| `/incidents` | Feature-only history |
| `/scenarios` | Family / CFO / official stories |
| `/enroll` | Feature-only voiceprint |
| `/guide` | How scoring works |

## Stack

| Layer | Choice |
|---|---|
| Web UI | Next.js (App Router) + TypeScript + Tailwind |
| Engine | Python 3.11 + FastAPI, CPU only |
| Stage 1 neural | AST (ASVspoof5) + wav2vec2, via plain `transformers` |
| Stage 1 signals | NumPy/SciPy DSP, no librosa |
| Stage 2 speech | faster-whisper (int8 CPU) |
| Stage 2 fraud | SilverGuard ONNX + bilingual lexicon + amount extraction |
| Audio decode | PyAV — no ffmpeg install required |
| Capture | Browser mic (`getUserMedia`) + file upload |

## Privacy

Raw audio is never stored or transmitted beyond the analysing process. Only derived
numbers — scores, signal values, and counts — are kept. Recordings and model weights are
both gitignored.

## What we are not building in v1

- A public voice-cloning feature
- A from-scratch anti-spoof model — we fine-tune nothing and train nothing
- Blockchain (deferred to Phase 5)
- Real core-banking or telecom-switch integration
