"""Measure Stage 2 against a public labelled dataset.

See docs/ENGINE.md Section 4. This produces the precision/recall/F1 table we show
judges, using data we did not write ourselves.

Dataset: karanverma19/Indian_Multilingual_Scam_Message_Dataset (Apache-2.0, 120
Hindi/Hinglish/English messages labelled scam or legit).

Usage:
    python eval_fraud.py                 # download and evaluate
    python eval_fraud.py --smoke         # offline smoke test only
    python eval_fraud.py --threshold 65
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from dataclasses import dataclass
from pathlib import Path

from engine.config import MODEL_CACHE, enable_utf8_console, settings
from engine.stage2_fraud import Transcript, assess_fraud

DATASET_REPO = "karanverma19/Indian_Multilingual_Scam_Message_Dataset"

# Offline sanity checks. These are OUR examples, so they are a smoke test that the
# wiring works, never a benchmark. Real numbers come from the public dataset.
SMOKE_CASES: list[tuple[str, bool]] = [
    ("Beta main hospital mein hoon, jaldi 50 hazaar bhej do, kisi ko mat batana", True),
    ("Sir this is CBI cyber cell, a warrant is issued, share the OTP to cancel it", True),
    ("Your KYC is pending, update immediately or the account will be frozen. Send Aadhaar and PIN", True),
    ("Madam aapke naam par parcel pakda gaya hai, police case hoga, turant 2 lakh transfer karo", True),
    ("Hi, are we still meeting for lunch tomorrow at one?", False),
    ("Please send me the meeting notes when you get a chance", False),
    ("Your OTP is 456789. Do not share it with anyone.", False),
    ("Ma, I reached the hostel safely, will call you tonight", False),
]


@dataclass
class Row:
    text: str
    is_scam: bool
    language: str = ""


@dataclass
class Metrics:
    true_positive: int = 0
    false_positive: int = 0
    true_negative: int = 0
    false_negative: int = 0

    @property
    def total(self) -> int:
        return self.true_positive + self.false_positive + self.true_negative + self.false_negative

    @property
    def accuracy(self) -> float:
        return (self.true_positive + self.true_negative) / self.total if self.total else 0.0

    @property
    def precision(self) -> float:
        denominator = self.true_positive + self.false_positive
        return self.true_positive / denominator if denominator else 0.0

    @property
    def recall(self) -> float:
        denominator = self.true_positive + self.false_negative
        return self.true_positive / denominator if denominator else 0.0

    @property
    def f1(self) -> float:
        if self.precision + self.recall == 0:
            return 0.0
        return 2 * self.precision * self.recall / (self.precision + self.recall)


def _parse_label(raw: str) -> bool | None:
    value = (raw or "").strip().lower()
    if value in {"scam", "spam", "fraud", "1", "true", "phishing"}:
        return True
    if value in {"legit", "ham", "legitimate", "0", "false", "safe"}:
        return False
    return None


def _rows_from_records(records: list[dict]) -> list[Row]:
    rows: list[Row] = []
    for record in records:
        text = ""
        for key in ("message", "text", "sms", "content", "body"):
            if record.get(key):
                text = str(record[key])
                break
        label = None
        for key in ("label", "class", "target", "is_scam"):
            if key in record:
                label = _parse_label(str(record[key]))
                break
        if text and label is not None:
            rows.append(Row(text, label, str(record.get("language", ""))))
    return rows


def load_dataset() -> list[Row]:
    """Fetch the dataset from the Hub, handling csv / json / jsonl layouts."""
    try:
        from huggingface_hub import hf_hub_download, list_repo_files
    except ImportError:
        print("huggingface_hub is not installed.")
        return []

    try:
        files = list_repo_files(DATASET_REPO, repo_type="dataset")
    except Exception as exc:  # noqa: BLE001
        print(f"Could not reach the dataset repo: {exc}")
        return []

    candidates = [
        name
        for name in files
        if name.lower().endswith((".csv", ".json", ".jsonl"))
        and not name.startswith(".")
        and "readme" not in name.lower()
    ]
    if not candidates:
        print(f"No csv/json file in {DATASET_REPO}. Files present: {files}")
        return []

    for name in candidates:
        try:
            path = Path(
                hf_hub_download(DATASET_REPO, name, repo_type="dataset", cache_dir=str(MODEL_CACHE))
            )
            raw = path.read_text(encoding="utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001
            print(f"  could not read {name}: {exc}")
            continue

        records: list[dict] = []
        if name.lower().endswith(".csv"):
            records = list(csv.DictReader(io.StringIO(raw)))
        elif name.lower().endswith(".jsonl"):
            for line in raw.splitlines():
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        else:
            try:
                parsed = json.loads(raw)
                records = parsed if isinstance(parsed, list) else parsed.get("data", [])
            except json.JSONDecodeError:
                continue

        rows = _rows_from_records(records)
        if rows:
            print(f"  loaded {len(rows)} rows from {name}")
            return rows

    print("Found candidate files but none contained usable message/label columns.")
    return []


def evaluate(rows: list[Row], threshold: int) -> tuple[Metrics, list[tuple[Row, int]]]:
    metrics = Metrics()
    mistakes: list[tuple[Row, int]] = []
    for row in rows:
        # Stage 2 operates on a transcript, so feed the text in as one.
        assessment = assess_fraud(Transcript(row.text, row.language or None, True))
        score = int(round(100 * assessment.score))
        predicted = score >= threshold
        if predicted and row.is_scam:
            metrics.true_positive += 1
        elif predicted and not row.is_scam:
            metrics.false_positive += 1
            mistakes.append((row, score))
        elif not predicted and row.is_scam:
            metrics.false_negative += 1
            mistakes.append((row, score))
        else:
            metrics.true_negative += 1
    return metrics, mistakes


def sweep(rows: list[Row]) -> None:
    print("\n=== Threshold sweep ===")
    header = f"{'thresh':>7} {'acc':>7} {'prec':>7} {'recall':>7} {'F1':>7}"
    print(header)
    print("-" * len(header))
    best = (0.0, 0)
    for threshold in range(20, 90, 5):
        metrics, _ = evaluate(rows, threshold)
        print(
            f"{threshold:>7} {metrics.accuracy:>7.3f} {metrics.precision:>7.3f} "
            f"{metrics.recall:>7.3f} {metrics.f1:>7.3f}"
        )
        if metrics.f1 > best[0]:
            best = (metrics.f1, threshold)
    print(f"\n  Best F1 {best[0]:.3f} at threshold {best[1]}.")
    print(
        "  Note: recall matters more than precision here. Missing a real scam costs a\n"
        "  victim their savings; a false alarm costs one phone call to verify."
    )


def report(metrics: Metrics, label: str) -> None:
    print(f"\n=== {label} ===")
    print(f"  samples:   {metrics.total}")
    print(f"  accuracy:  {metrics.accuracy:.3f}")
    print(f"  precision: {metrics.precision:.3f}")
    print(f"  recall:    {metrics.recall:.3f}")
    print(f"  F1:        {metrics.f1:.3f}")
    print(
        f"  confusion: TP={metrics.true_positive} FP={metrics.false_positive} "
        f"TN={metrics.true_negative} FN={metrics.false_negative}"
    )


def main() -> int:
    enable_utf8_console()
    parser = argparse.ArgumentParser(description="Evaluate the VoxShield fraud layer.")
    parser.add_argument("--threshold", type=int, default=None, help="Fraud score threshold (0-100).")
    parser.add_argument("--smoke", action="store_true", help="Run only the offline smoke test.")
    parser.add_argument("--sweep", action="store_true", help="Sweep thresholds on the public dataset.")
    args = parser.parse_args()

    threshold = args.threshold or int(settings.thresholds("standard", "fraud")["high"])
    print(f"VoxShield Stage 2 evaluation\n  profile:   {settings.profile}\n  threshold: {threshold}")

    print("\nSmoke test (our own examples - wiring check, not a benchmark):")
    smoke_rows = [Row(text, is_scam) for text, is_scam in SMOKE_CASES]
    smoke_metrics, smoke_mistakes = evaluate(smoke_rows, threshold)
    for row in smoke_rows:
        assessment = assess_fraud(Transcript(row.text, None, True))
        score = int(round(100 * assessment.score))
        flag = "SCAM" if score >= threshold else "ok  "
        expected = "SCAM" if row.is_scam else "ok  "
        mark = " " if flag == expected else "X"
        categories = ",".join(assessment.lexicon.categories) or "-"
        print(f"  {mark} {flag} (want {expected}) {score:>3}  [{categories}]  {row.text[:58]}")
    report(smoke_metrics, "Smoke test")

    if args.smoke:
        return 0 if not smoke_mistakes else 1

    print(f"\nLoading public dataset: {DATASET_REPO}")
    rows = load_dataset()
    if not rows:
        print(
            "\nCould not load the public dataset, so no benchmark numbers are available.\n"
            "The smoke test above only proves the wiring works. Do not quote it as accuracy."
        )
        return 1

    languages: dict[str, int] = {}
    for row in rows:
        key = row.language or "unknown"
        languages[key] = languages.get(key, 0) + 1
    print(f"  languages: {languages}")
    print(f"  scam: {sum(1 for r in rows if r.is_scam)}, legit: {sum(1 for r in rows if not r.is_scam)}")

    metrics, mistakes = evaluate(rows, threshold)
    report(metrics, f"{DATASET_REPO} @ threshold {threshold}")

    if mistakes:
        print(f"\n  Misclassified ({len(mistakes)}), worst first:")
        for row, score in sorted(mistakes, key=lambda item: item[1], reverse=True)[:12]:
            kind = "missed scam" if row.is_scam else "false alarm"
            print(f"    {score:>3} {kind:<12} {row.text[:64]}")

    if args.sweep:
        sweep(rows)

    print(
        "\nThis dataset is SMS text, which is what SilverGuard was trained on. Speech\n"
        "transcripts are messier: Whisper drops words and has no punctuation, so expect\n"
        "somewhat lower recall in the live product than these numbers suggest."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
