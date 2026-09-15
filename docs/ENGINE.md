# VoxShield Detection Engine — Implementation Contract

**Status:** Authoritative. Version 1.0, 12 Sep 2026.

This document is the **single source of truth** for the detection engine. Where this
document and any other file disagree about the engine, **this document wins** and the
other file is a bug.

- [PRD.md](../PRD.md) defines *what the product is* (users, scope, phases, demo).
- **This file defines *how detection works*** (models, signals, formulas, thresholds, JSON).

Rules for anyone (human or AI) working on the engine:

1. Do not invent model IDs. Only the exact Hugging Face IDs in Section 3 and Section 5 are permitted.
2. Do not invent thresholds. All numbers live in Section 7 and [apps/api/calibration.json](../apps/api/calibration.json).
3. Do not blend the two scores into one. See Section 2.
4. Do not add a dependency that is not in [apps/api/requirements.txt](../apps/api/requirements.txt).
5. If a signal cannot be computed, return `null` for it and renormalize. Never substitute a guess.

---

## 1. The problem this engine solves

Two questions, asked independently of each other:

| Stage | Question | Output |
|---|---|---|
| **Stage 1** | Is this voice synthetic (AI-generated) or a real human? | `authenticity.score` 0–100 |
| **Stage 2** | Is this speech an attempt at fraud? | `fraud.score` 0–100 |

`authenticity.score` is the probability the audio is **synthetic**. Higher = more likely AI.
`fraud.score` is the probability the *content* is a **scam**. Higher = more likely fraud.

### 1.1 Why zero-shot detection is hard (design constraint, not an excuse)

The [Podonos 2026 benchmark](https://github.com/podonos/audio-dfd-benchmark) measured
popular free detectors against modern commercial voice cloners:

| Model | Accuracy | False-negative rate |
|---|---|---|
| AASIST | 48.2% | 51.1% |
| LCNN-LFCC | 50.0% | 0.0% (predicts everything fake) |
| RawNet2 | 50.7% | 62.7% |
| Wav2Vec2 SSL | 62.9% | 60.8% |

These were trained on ASVspoof 2019, which predates noiz.ai and every 2025–2026 cloner.
**A single off-the-shelf checkpoint is expected to miss our clone.** The engine is therefore
built so that no single component can decide the verdict alone:

1. **Architectural diversity** — one spectrogram model plus one waveform model. Their
   errors are less correlated than two models of the same family. Per
   [arxiv 2410.07436](https://doi.org/10.48550/arxiv.2410.07436), AST reaches 85% on
   out-of-distribution audio where wav2vec2 reaches 81%.
2. **Independent DSP evidence** — measurable physical signals (Section 4) that neural
   detectors do not use, and which survive the phone-speaker replay channel.
3. **Calibration on our own clips** — threshold selection, not training (Section 8).

---

## 2. Two scores must stay separate

**Never merge `authenticity.score` and `fraud.score` into one number.**

The reason is the case that matters most to banks: a *real human* reading a scam script.
A blended score would dilute a 95 fraud score with a 10 authenticity score and produce a
mid-band "review", losing the attack.

### 2.1 Action matrix

`verdict` is derived from the two scores using these rules, evaluated top to bottom:

| # | Condition | `verdict` | Meaning |
|---|---|---|---|
| 1 | `authenticity >= high` AND `fraud >= high` | `critical` | Voice-clone impersonation attack in progress |
| 2 | `authenticity < review` AND `fraud >= high` | `fraud_human` | Live social engineering by a real person |
| 3 | `authenticity >= high` AND `fraud < review` | `synthetic_benign` | Synthetic voice, no fraud language (may be a legitimate IVR/assistant) |
| 4 | `authenticity >= review` OR `fraud >= review` | `review` | Something is off; verify before acting |
| 5 | otherwise | `clear` | No action |

If either stage returns `insufficient_audio`, `verdict` is `insufficient_audio` and no
other rule is evaluated.

Rule 2 is the requirement that makes VoxShield useful to a bank rather than a novelty.

A cloned relative asking for a Hotstar or Prime OTP is **not** `synthetic_benign`.
The words can be genuine family speech; the attack is the voice. Fusion therefore
raises fraud to `high` when Stage 1 is synthetic (or the enrolled voiceprint
mismatches) and the transcript still contains an OTP/PIN ask — even if the named
service is entertainment. Words alone cannot prove where that OTP will be typed.

---

## 3. Stage 1 — synthetic voice detection

### 3.1 Neural sub-layer

Exactly two models. Both load with plain `transformers`, run on CPU, need no `fairseq`,
and work on Windows.

| Role | Hugging Face ID | Arch | Size | License |
|---|---|---|---|---|
| Primary | `MattyB95/AST-ASVspoof5-Synthetic-Voice-Detection` | AST (spectrogram ViT) | ~344 MB | BSD-3-Clause |
| Cross-check | `MelodyMachine/Deepfake-audio-detection-V2` | wav2vec2 | ~378 MB | Apache-2.0 |

The AST model reports 0.833 accuracy, 0.889 F1, 0.921 precision, and **0.859 recall** on
ASVspoof5 validation. Read the recall first: it misses roughly one spoof in seven on the
data it was trained for, and out-of-distribution it will be worse. That is the honest
reason Stage 1 gives the neural layer only 0.55 of the weight.

An earlier draft of this document specified `WpythonW/ast-fakeaudio-detector`, which
claims a higher 0.971 F1. It is **gated behind manual approval by its author** and cannot
be downloaded without it, so it is unusable for us. Do not reinstate it. The replacement
is trained on ASVspoof5, the 2024 challenge set, rather than the 2019 data behind most
open detectors, so the lower headline number is measured on newer and more relevant
attacks.

**The two models label their classes in opposite orders**: the AST model is
`{0: Bonafide, 1: Spoof}` and the wav2vec2 model is `{0: fake, 1: real}`. Neither order is
hardcoded anywhere; both are resolved from `config.id2label` as described below. This is
not a trivia note — hardcoding either one would invert the other.

Both are loaded via:

```python
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
extractor = AutoFeatureExtractor.from_pretrained(model_id)
model = AutoModelForAudioClassification.from_pretrained(model_id).eval()
inputs = extractor(audio_16k, sampling_rate=16000, return_tensors="pt")
probs = torch.softmax(model(**inputs).logits, dim=-1)
```

**Label mapping is not assumed.** Each model's `config.id2label` is read at load time and
the index whose label matches `/fake|spoof|synthetic/i` is used as the synthetic
probability. If the labels are ambiguous (e.g. `LABEL_0` / `LABEL_1`), the mapping is read
from `calibration.json -> models.<key>.fake_index`, which defaults to `0`. This mapping is
verified empirically during calibration (Section 8) and is a known failure mode: an
inverted label flips the whole verdict.

**Disagreement.** `disagreement = abs(ast_prob - w2v2_prob)`. When
`disagreement > 0.5`, the two models contradict each other. The engine then reduces
`confidence` and lets the DSP layer dominate, rather than averaging two contradictory
opinions into false certainty.

#### Not used by default: NII AntiDeepfake

`nii-yamagishilab/wav2vec-large-anti-deepfake` has better published generalization
(1.91% EER on In-the-Wild) but is **excluded from the default path** because:

- it requires `fairseq==0.12.2`, which does not build on Windows (upstream has stated
  Windows is unsupported; the failure is a C++ linker error), and
- it is CC BY-NC-SA 4.0 (non-commercial), which must be disclosed for any productization.

It stays documented as an upgrade for a Linux/WSL machine behind the
`VOXSHIELD_ENABLE_ANTIDEEPFAKE` flag. It must never become a Phase 3 exit dependency.

### 3.2 DSP / prosody sub-layer

Every signal below is computed in [apps/api/engine/signals.py](../apps/api/engine/signals.py)
from 16 kHz mono float32 audio. Each returns a `SignalReading`:

```python
SignalReading(
    key: str,            # stable machine name
    label: str,          # short human name for the UI
    value: float | None, # the raw measurement
    unit: str,           # "Hz", "%", "ratio", "count"
    suspicion: float,    # 0.0-1.0 contribution toward "synthetic"
    reason: str,         # one plain-English sentence for the UI and the viva
)
```

`suspicion` is always 0.0–1.0 where 1.0 means "strongly indicates synthetic". A signal
that cannot be computed returns `value=None, suspicion=None` and is excluded from the
weighted mean, with remaining weights renormalized.

| Key | Measures | Indicates synthetic when | Weight |
|---|---|---|---|
| `pitch_stability` | Std-dev and range of F0 across voiced frames | Std-dev is low (monotone) | 0.20 |
| `jitter` | Mean absolute cycle-to-cycle F0 change, as % of mean F0 | Near zero — human vocal folds always perturb | 0.18 |
| `shimmer` | Cycle-to-cycle amplitude perturbation, as % | Near zero | 0.12 |
| `pause_regularity` | Coefficient of variation of silence-gap durations | CV is low — TTS pause grids are metronomic | 0.18 |
| `hf_cutoff` | Highest frequency holding meaningful energy | A brick wall below ~7 kHz (vocoder ceiling) | 0.14 |
| `spectral_flatness` | Geometric ÷ arithmetic mean of the spectrum | Unusually high (noise-like residual) or unusually low (over-smoothed) | 0.10 |
| `breath` | Count of breath-like unvoiced bursts per 10 s | Zero over a long utterance — most TTS omits inhalation | 0.08 |

Weights are relative and renormalized over available signals, so they need not sum to 1.0.

**F0 extraction** is autocorrelation-based over 40 ms Hann-windowed frames with 10 ms hop,
searched across 70–400 Hz. A frame is voiced when its normalized autocorrelation peak
exceeds `voicing_threshold` (default 0.35). Signals requiring F0 return `None` when fewer
than 12 voiced frames exist.

**Important honesty note.** `jitter` and `shimmer` are the strongest DSP signals on clean
audio, and the *weakest* after phone-speaker replay, because the replay channel adds its
own perturbation and can make a clone look human. This is exactly why the `replay/`
calibration set in Section 8 is mandatory.

### 3.3 Disfluency sub-layer

Depends on the Stage 2 transcript, so it is computed after transcription and injected back
into Stage 1. When no transcript is available, this signal is `None` and its weight is
redistributed.

Counted markers (case-insensitive, word-boundary matched):

- English: `um, umm, uh, uhh, er, err, ah, ahh, hmm, hm, mmm, like, you know, i mean`
- Hindi / Hinglish: `matlab, haan, achha, arre, woh, yaani, kya bolun`

`disfluency_rate = markers / max(1, words) * 100`

Suspicion rises as the rate approaches zero, but **only when there are enough words to
judge**: below `min_words_for_disfluency` (default 25) the signal returns `None`. A
scripted human reading aloud also has no disfluencies, so this signal is corroborating
evidence, never a sole basis for a `high` band.

### 3.4 Stage 1 fusion

```
neural_component = 0.64 * ast_prob + 0.36 * w2v2_prob      # renormalized if one is absent
dsp_component    = weighted mean of available SignalReading.suspicion
disfl_component  = disfluency suspicion, or absent

authenticity_raw = weighted mean over available components:
    neural       0.55
    dsp          0.30
    disfluency   0.15

authenticity.score = round(100 * clamp(authenticity_raw, 0, 1))
```

If the neural component is unavailable (models disabled or failed to load), the remaining
weights renormalize to `dsp 0.67 / disfluency 0.33` and `authenticity.degraded = true` is
set so the UI can say so out loud.

---

## 4. Stage 2 — fraud detection

### 4.1 Transcription

`faster-whisper`, CPU, `compute_type="int8"`, `vad_filter=True`.

| Setting | Value |
|---|---|
| Default model | `small` (accuracy) |
| Lite model | `base` (speed) — via `VOXSHIELD_WHISPER_MODEL` |
| Language | `en`, `hi`, or `None` for auto-detect (needed for Hinglish) |
| Beam size | 1 for streaming, 5 for upload |

`faster-whisper` decodes through bundled PyAV, so **no `ffmpeg` binary is required**.
This is deliberate: `ffmpeg` is not installed on the demo laptop.

Transcripts are held in memory for scoring and are **not persisted** by default
(PRD Pv1/Pv2).

### 4.2 Fraud signals

| Source | What it contributes | Weight |
|---|---|---|
| `tanishqmudaliar/SilverGuard` | ONNX MobileBERT threat score 0–1, trained on Indian scam archetypes | 0.45 |
| Lexicon (Section 4.3) | Weighted category hits, fully auditable | 0.40 |
| Amount extraction (Section 4.4) | Escalation when a large sum is demanded | 0.15 |

SilverGuard is MobileBERT (24M params, ~25 MB, **MIT license**) exported to ONNX and run
with `onnxruntime`. Its training archetypes map directly onto SIH26104's threat model:
digital arrest, bank-freeze/KYC, OTP fraud, lottery, job scam, parcel/courier,
RBI/TRAI/EPFO impersonation, investment and utility scams.

Three integration details that matter, because getting them wrong silently zeros the
layer:

1. The ONNX output `threat_score` is **already a softmax probability**. Do not apply
   sigmoid or softmax again — that maps a true 0.0 to 0.5 and collapses every score into
   a useless mid-band.
2. Tokenise with the `vocab.txt` and WordPiece logic shipped in the SilverGuard repo.
   Hugging Face's BertTokenizer is close but not identical, and the mismatch was enough
   to drive clear scam scripts to a threat score of 0.
3. The model was trained with an optional TRAI DLT sender header (`HEADER [SEP] body`).
   Voice transcripts have no DLT ID. We inject a synthetic raw-number header only when
   the lexicon already looks suspicious; blindly prefixing every transcript made benign
   "please send the notes" and bank OTP texts look like scams.

It was trained on **SMS text**, not speech transcripts. Its score is therefore weighted at
0.45 rather than being trusted outright, and the lexicon provides an independent,
inspectable second opinion. When the classifier returns a confident "ham" (< 0.25) on a
multi-category script the lexicon scores ≥ 0.5, the fusion drops the classifier and
renormalises over lexicon + amount — Hinglish speech is exactly where SilverGuard goes
quiet.

### 4.3 Lexicon

Defined in [apps/api/engine/lexicon.py](../apps/api/engine/lexicon.py). Every category
carries a weight; a category contributes once regardless of how many of its terms hit, so
repetition cannot inflate the score.

| Category | Weight | Terms (English + Hindi/Hinglish) |
|---|---|---|
| `credentials` | 1.00 | Diagnostic: cvv, upi pin, card number, otp batao. Intent: asked to disclose OTP/PIN/password, KYC used as a freeze threat, asked for card/CVV |
| `coercion` | 0.95 | kill, kidnap, kidnapped, police, arrest, warrant, court case, fir, jail, giraftar, police case, jaan se |
| `secrecy` | 0.80 | don't tell, do not tell, keep this between us, don't disconnect, stay on the line, kisi ko mat batana, phone mat rakho |
| `urgency` | 0.70 | right now, immediately, within 10 minutes, last warning, emergency, abhi, jaldi, turant |
| `money` | 0.65 | Diagnostic: send money, upi, gpay, ifsc, pay now. Intent: transfer/send/bhej next to money, UPI, or an amount — not notes/orders/files |
| `authority` | 0.60 | cbi, income tax, customs, rbi, trai, bank manager, cyber cell, enforcement directorate |

Isolated `otp`, `kyc`, `credit card`, `transfer`, `send`, and `money` **do not** raise a
category. Genuine speech uses them constantly ("transfer the order", "your OTP is… do
not share", "KYC is already done"). A category fires only on a diagnostic multi-word
phrase or an intent frame: solicit a secret, coerce a payment, or threaten a freeze over
KYC. Bank-style "do not share this OTP" is treated as a warning, not a harvest, unless
the speaker also says "with me". An OTP asked for Hotstar / Prime / Netflix is an
**entertainment login**, not a bank secret — unless Stage 1 says the voice is
synthetic or the enrolled voiceprint mismatches.

Category score = `sum(weights of hit categories) / 2.15`, clamped to 1.0. The denominator
is chosen so two heavy categories (credentials + coercion ≈ 1.95) or three mid-weight ones
(secrecy + urgency + money = 2.15) saturate. Dividing by the sum of every category weight
instead capped even a four-category hit around 0.73, so the lexicon could never clear the
high fraud band without the SMS classifier.

**Two or more categories is the meaningful signal.** A single `money` hit can still be a
real lunch request. `credentials + urgency + coercion` together is a scam. The scorer
therefore applies a multiplier of 0.55 when only one category hits.

### 4.4 Amount extraction

Regex over the transcript, in [apps/api/engine/lexicon.py](../apps/api/engine/lexicon.py):

- Digit forms: `10000`, `10,000`, `₹10000`, `rs 10000`, `inr 10000`
- Indian scale words: `50 hazaar`, `2 lakh`, `1.5 crore`, `5 thousand`
- Multipliers: `thousand`/`hazaar` = 1e3, `lakh`/`lac` = 1e5, `crore` = 1e7
- Bare numbers without a currency word must be ≥ ₹10,000, and 4–6 digit runs next to
  OTP/PIN language are ignored so "Your OTP is 456789" does not become a ₹4.5 lakh request.

Escalation bands (the largest amount found wins):

| Amount (INR) | Contribution |
|---|---|
| < 5,000 | 0.20 |
| 5,000 – 49,999 | 0.50 |
| 50,000 – 499,999 | 0.80 |
| >= 500,000 | 1.00 |

The extracted figure is returned in the payload so the alert can name it
("demanded ₹50,000"), which is far more persuasive to a non-technical victim than a score.

### 4.5 Scam category label (optional, off by default)

`MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` zero-shot NLI to *name* the
scam ("digital arrest", "OTP theft", "family emergency money request"). Adds ~500 MB, so
it is gated behind `VOXSHIELD_ENABLE_CATEGORY`. It only labels; it never changes the score.

---

## 5. Model registry

Every model the engine may load. No other model IDs are permitted.

Before adding any model to this table, check `gated` on its Hugging Face API record
(`https://huggingface.co/api/models/<id>`). A gated repo needs manual approval from its
author and will fail to download in the demo environment, which is how the original
Stage 1 primary had to be replaced.

| Key | HF ID | Purpose | Default | Size |
|---|---|---|---|---|
| `ast` | `MattyB95/AST-ASVspoof5-Synthetic-Voice-Detection` | Stage 1 primary | on | ~344 MB |
| `w2v2` | `MelodyMachine/Deepfake-audio-detection-V2` | Stage 1 cross-check | on | ~378 MB |
| `whisper` | `small` (via faster-whisper) | Stage 2 transcript | on | ~250 MB |
| `silverguard` | `tanishqmudaliar/SilverGuard` | Stage 2 scam score | on | ~25 MB |
| `category` | `MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` | Scam naming | off | ~500 MB |
| `antideepfake` | `nii-yamagishilab/wav2vec-large-anti-deepfake` | Stage 1 upgrade (Linux only) | off | ~1.2 GB |

Profiles, via `VOXSHIELD_PROFILE`:

- `full` (default): ast + w2v2 + whisper-small + silverguard — about 1 GB
- `lite`: ast + whisper-base + silverguard — about 450 MB
- `dsp_only`: no neural models; DSP and lexicon only, so the API still answers on a
  machine that cannot download weights

Weights are cached under `apps/api/.models/` which is **gitignored**.

---

## 6. Audio handling

| Concern | Decision |
|---|---|
| Internal format | 16 kHz, mono, float32 in −1.0…1.0 |
| Decoders | `soundfile` for wav/flac/ogg; PyAV for webm/opus/mp3/m4a |
| Resampling | `scipy.signal.resample_poly` |
| Browser capture | MediaRecorder produces **webm/opus**, which `soundfile` cannot read — PyAV handles it |
| Streaming window | 3.0 s of trailing audio, re-scored every 1.5 s |
| Upload | whole file, capped at 60 s for latency |

### 6.1 Audio-sufficiency gate

Before any scoring, audio must pass all of:

| Check | Threshold |
|---|---|
| Duration | >= 1.0 s |
| RMS | >= 0.008 |
| Voiced frame ratio | >= 0.08 |

Failing any check returns `insufficient_audio` with **no scores at all**. Guessing on
silence is the single fastest way to lose credibility in a demo (PRD C7, D-metrics).

---

## 7. Response contract

This is the exact JSON both `POST /analyze` and `WS /stream` return. The web client type
in [apps/web/src/lib/types.ts](../apps/web/src/lib/types.ts) must match it field for field.

```json
{
  "status": "ok",
  "verdict": "critical",
  "confidence": 0.81,
  "authenticity": {
    "score": 88,
    "band": "high",
    "label": "Likely AI-generated",
    "degraded": false,
    "components": {
      "neural": { "score": 0.91, "models": { "ast": 0.94, "w2v2": 0.86 }, "disagreement": 0.08 },
      "dsp": { "score": 0.82 },
      "disfluency": { "score": 0.90 }
    },
    "signals": [
      {
        "key": "jitter",
        "label": "Vocal jitter",
        "value": 0.21,
        "unit": "%",
        "suspicion": 0.93,
        "reason": "Cycle-to-cycle pitch variation is far below the human range; real vocal folds are never this stable."
      }
    ]
  },
  "fraud": {
    "score": 91,
    "band": "high",
    "label": "Fraud indicators present",
    "transcript_available": true,
    "components": {
      "classifier": { "score": 0.88, "model": "silverguard" },
      "lexicon": { "score": 0.93, "categories": ["credentials", "coercion", "urgency"] },
      "amount": { "score": 0.8, "detected_inr": 50000, "raw": "50 hazaar" }
    },
    "matched_terms": [
      { "category": "credentials", "term": "asked them to disclose a secret (OTP, PIN, password, or KYC)" },
      { "category": "coercion", "term": "police" }
    ]
  },
  "meta": {
    "window_ms": 3000,
    "audio_ms": 3000,
    "latency_ms": 412,
    "profile": "full",
    "retention": "features_only",
    "engine_version": "1.0"
  }
}
```

`insufficient_audio` response:

```json
{
  "status": "insufficient_audio",
  "verdict": "insufficient_audio",
  "reason": "Need at least 1 second of voiced speech.",
  "meta": { "audio_ms": 420, "retention": "features_only", "engine_version": "1.0" }
}
```

### 7.1 Bands and thresholds

Both scores use the same band names but **different thresholds**, because the cost of a
false positive differs.

| Preset | Authenticity review / high | Fraud review / high |
|---|---|---|
| `standard` | 40 / 70 | 35 / 65 |
| `high_value` | 30 / 55 | 25 / 50 |

`high_value` is the Operations preset for large transfers, where a missed attack costs
more than an unnecessary verification step. Every number here is overridable in
[apps/api/calibration.json](../apps/api/calibration.json) without touching code.

### 7.2 Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Which models actually loaded, profile, engine version, `warming` / `ready` |
| `GET /v1/capabilities` | Integrator discovery: profile, models, calibrated, languages, verdicts, recommended host actions |
| `POST /analyze` | Multipart `file`, optional `preset`, `language`, `want_transcript`, context flags (`known_contact`, `unknown_number`, `high_value`, `call_origin`), optional `enrollment_features` JSON |
| `POST /score-text` | Form `text` + optional `preset` + same context flags → fraud score from captions / transcript alone (no audio) |
| `WS /stream` | Binary PCM16 frames after `{"type":"start","sample_rate":…}`; start JSON may include context + `enrollment_features` |
| `WS /ws/call-stream/{call_id}` | Alias of `/stream` for dialler-style hosts that bind a call id |

Optional response blocks on `status: "ok"`:

| Block | Purpose |
|---|---|
| `context` | Echo of host metadata + `enrichment_boost` (bounded fraud bump only — never blended into authenticity) |
| `identity` | DSP voiceprint compare when `enrollment_features` was supplied (`method: "dsp_features_v1"`). **Not ECAPA.** |

`WS /stream` (and the call-stream alias) add `"partial": true` and `"t_ms": <ms since session start>` to each scored frame.

Recommended **host** actions per verdict (Core does not execute them):

| Verdict | Typical host policy |
|---|---|
| `clear` | Continue |
| `review` | Soft warn / secondary check |
| `fraud_human` | Hold transfer, MFA, or callback on a known number |
| `synthetic_benign` | Flag synthetic voice; content not elevated as scam |
| `critical` | Block / cut / escalate immediately |

Thin TypeScript client: [apps/web/src/sdk](../apps/web/src/sdk) — `analyze`, `scoreText`, `connectStream`, `fetchCapabilities`. When `VOXSHIELD_API_KEY` is set, hosts send `X-API-Key` (REST) or `?api_key=` (WebSocket). `GET /health` stays open.

---

## 8. Calibration (threshold selection, not training)

We do **not** fine-tune. No GPU, no storage cost, no hours of training. We choose decision
boundaries from our own clips, which is legitimate and standard practice.

### 8.1 Required clip layout

```
demo/audio/real/     genuine recordings of the teammate    (>= 3 clips)
demo/audio/clone/    noiz.ai clones, downloaded digitally  (>= 3 clips)
demo/audio/replay/   clone played from a phone speaker into the laptop mic
```

`demo/audio/` is gitignored. Voices are not committed.

### 8.2 The `replay/` set is mandatory

The live demo plays the clone from a phone speaker 20–40 cm from the laptop mic. That
channel band-limits the audio, adds room reverb and noise, and **shifts every DSP signal**,
especially jitter and shimmer. Calibrating only on clean downloads would produce thresholds
that look perfect in testing and fail in the hall.

To record the replay set: play each `clone/` file from the phone, capture with
`POST /analyze` or any recorder, and save as `demo/audio/replay/<same-name>.wav`.

### 8.3 What `calibrate.py` does

```
python calibrate.py                 # score everything, print a table
python calibrate.py --write         # also write thresholds into calibration.json
```

1. Scores every clip in all three folders through the real engine.
2. Prints a per-file table: each component, each signal, and the final scores.
3. **Verifies label polarity** — if `real/` scores higher than `clone/` on a neural model,
   that model's `fake_index` is inverted and the script says so loudly. This is a real and
   easy-to-miss failure mode.
4. Reports the separation gap `min(clone ∪ replay) − max(real)`.
5. Suggests thresholds at the midpoint of the gap, and with `--write` saves them.

### 8.4 Exit criteria (PRD Section 17, Phase 3 gate)

| Check | Requirement |
|---|---|
| Separation | `min(clone ∪ replay) − max(real) >= 25` points |
| Genuine clips | every `real/` clip lands in `genuine` band |
| Clone clips | every `clone/` clip lands in `high` band |
| Replay clips | every `replay/` clip lands in `review` or `high` |
| Silence | returns `insufficient_audio`, never a score |
| Latency | first score within 3 s of voiced audio on CPU |

If separation is below 25 points, **do not tune thresholds until the test passes.** Fix the
signals, or record better clips, and write the real numbers into the README. An honest 78%
that we can explain beats a fake 99% that collapses under a judge's question.

---

## 9. File map

| File | Responsibility |
|---|---|
| [apps/api/main.py](../apps/api/main.py) | FastAPI app, Core endpoints, CORS, lifespan warmup |
| [apps/api/engine/config.py](../apps/api/engine/config.py) | Env flags, profiles, calibration loading |
| [apps/api/engine/schemas.py](../apps/api/engine/schemas.py) | Pydantic models mirroring Section 7 exactly |
| [apps/api/engine/audio_io.py](../apps/api/engine/audio_io.py) | Decode, resample to 16 kHz mono, sufficiency gate |
| [apps/api/engine/signals.py](../apps/api/engine/signals.py) | F0, jitter, shimmer, pauses, HF cutoff, flatness, breath |
| [apps/api/engine/stage1_neural.py](../apps/api/engine/stage1_neural.py) | AST + wav2vec2 loading, label mapping, disagreement |
| [apps/api/engine/lexicon.py](../apps/api/engine/lexicon.py) | Categories, terms, amount regex, disfluency markers |
| [apps/api/engine/stage2_fraud.py](../apps/api/engine/stage2_fraud.py) | Whisper, SilverGuard, lexicon scoring |
| [apps/api/engine/fusion.py](../apps/api/engine/fusion.py) | Two scores, bands, action matrix, payload assembly |
| [apps/api/calibrate.py](../apps/api/calibrate.py) | Section 8 harness |
| [apps/api/eval_fraud.py](../apps/api/eval_fraud.py) | Stage 2 metrics on a public labelled dataset |
| [apps/web/src/sdk](../apps/web/src/sdk) | Thin TS SDK: analyze, scoreText, connectStream, capabilities |
| [apps/api/engine/identity.py](../apps/api/engine/identity.py) | DSP voiceprint match (`dsp_features_v1`) — not ECAPA |
| [apps/web/src/lib/engine-client.ts](../apps/web/src/lib/engine-client.ts) | Re-exports SDK + browser-fallback helpers for the demo app |
| [apps/web/src/lib/scoring.ts](../apps/web/src/lib/scoring.ts) | Browser fallback only — **not** the source of truth |

### 9.1 About the browser scorer

[apps/web/src/lib/scoring.ts](../apps/web/src/lib/scoring.ts) stays in the repo as a
**degraded fallback** so the UI still moves if the Python engine is not running. It is
explicitly *not* the real engine. Any UI showing fallback numbers must label them as
`engine: "browser-fallback"`. Never quote fallback numbers as detection accuracy.

---

## 10. Deployment

Hugging Face moved Docker Spaces behind a paid plan, so free API hosting there is no longer
available. Current shape:

| Piece | Where | Why |
|---|---|---|
| Next.js UI | Vercel free tier | Static-friendly, no model weights |
| Detection engine | Local `uvicorn` on the demo laptop | Models are ~1 GB; on-device processing is a genuine privacy selling point and removes demo-day network risk |
| Fallback | Browser scorer | UI never hard-fails |

Running the engine locally is the honest answer for a hackathon, and it strengthens the
privacy story rather than weakening it: the audio never leaves the device.

---

## 11. Known limitations (state these before a judge asks)

1. **Zero-shot on a 2026 cloner is hard.** Published numbers for our models come from
   In-the-Wild and similar sets, not from noiz.ai. Our real number is whatever
   `calibrate.py` reports on our own clips, and that is the number we quote.
2. **Replay degrades jitter and shimmer.** Band-limiting adds perturbation that can make a
   clone look more human. Mitigated by the `replay/` calibration set.
3. **Disfluency is corroborating only.** A human reading a script has none either.
4. **SilverGuard was trained on SMS, not speech.** Weighted at 0.45 with an independent
   lexicon as a second opinion.
5. **Whisper errors propagate to Stage 2.** A missed word can drop an intent frame, not
   just a keyword. The lexicon matches on normalized text and nearby collocations to
   reduce this, and Stage 1 is unaffected.
6. **No speaker identity verification yet.** The engine answers "is this synthetic", not
   "is this actually Priya". The web `/enroll` page is a **feature-only stub** — not
   ECAPA-TDNN. Cross-session voiceprint remains PRD roadmap / Phase later.
7. **We do not load classic AASIST weights.** Stage 1 neural is AST (ASVspoof5) + wav2vec2.
   AASIST appears in docs only as a weak Podonos baseline (~48%), not as a loaded model.
8. **Multilingual coverage is limited.** Whisper auto-detect + EN/HI lexicon — not full
   dialect coverage across India.

---

## 12. Document control

| Version | Date | Notes |
|---|---|---|
| 1.0 | 12 Sep 2026 | Two-stage engine contract. Supersedes PRD Section 8 single-score fusion. Models, signals, thresholds, JSON frozen. |

Changing Section 2 (two-score separation), Section 5 (model registry), or Section 7
(response contract) requires a team decision, not a silent edit.
