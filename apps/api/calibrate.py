"""Calibration harness: choose thresholds from our own clips.

This is threshold selection, not training. No GPU, no storage cost, seconds to run.
See docs/ENGINE.md Section 8.

Usage:
    python calibrate.py                 # score everything and print the tables
    python calibrate.py --write         # also write thresholds into calibration.json
    python calibrate.py --dir ../../demo/audio

Expected layout (demo/audio is gitignored; we never commit voices):
    demo/audio/real/     genuine recordings of the teammate
    demo/audio/clone/    noiz.ai clones, downloaded digitally
    demo/audio/replay/   clone played from a phone speaker into the laptop mic
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from dataclasses import dataclass
from pathlib import Path

from engine import fusion
from engine.audio_io import DecodeError, decode_native, resample_to
from engine.config import (
    CALIBRATION_PATH,
    REPO_ROOT,
    SAMPLE_RATE,
    enable_utf8_console,
    load_calibration,
    save_calibration,
    settings,
)
from engine.schemas import AnalysisOut

AUDIO_SUFFIXES = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm", ".opus", ".aac"}
CLASSES = ("real", "clone", "replay")


@dataclass
class Scored:
    path: Path
    label: str
    result: AnalysisOut | None
    error: str | None = None

    @property
    def authenticity(self) -> int | None:
        return self.result.authenticity.score if self.result else None

    @property
    def fraud(self) -> int | None:
        return self.result.fraud.score if self.result else None


def find_clips(root: Path) -> dict[str, list[Path]]:
    found: dict[str, list[Path]] = {}
    for label in CLASSES:
        folder = root / label
        if not folder.is_dir():
            found[label] = []
            continue
        clips = sorted(
            path
            for path in folder.iterdir()
            if path.is_file() and path.suffix.lower() in AUDIO_SUFFIXES
        )
        found[label] = clips
    return found


def score_clip(path: Path, label: str, preset: str) -> Scored:
    try:
        payload = path.read_bytes()
        native, native_rate = decode_native(payload)
        model_audio = resample_to(native, native_rate, SAMPLE_RATE)
        result = fusion.analyze(
            model_audio,
            SAMPLE_RATE,
            preset=preset,
            spectral_samples=native,
            spectral_rate=native_rate,
            want_transcript=True,
        )
    except DecodeError as exc:
        return Scored(path, label, None, f"decode failed: {exc}")
    except Exception as exc:  # noqa: BLE001 - one bad clip must not stop the run
        return Scored(path, label, None, f"{type(exc).__name__}: {exc}")

    if result.status != "ok":
        return Scored(path, label, None, f"insufficient audio: {result.reason}")
    return Scored(path, label, result)


def print_scores(scored: list[Scored]) -> None:
    print("\n=== Per-clip scores ===")
    header = f"{'class':<8} {'file':<34} {'auth':>5} {'fraud':>6} {'verdict':<18} {'conf':>5}"
    print(header)
    print("-" * len(header))
    for item in scored:
        if item.result is None:
            print(f"{item.label:<8} {item.path.name[:34]:<34} {'--':>5} {'--':>6} {item.error or 'failed'}")
            continue
        print(
            f"{item.label:<8} {item.path.name[:34]:<34} "
            f"{item.result.authenticity.score:>5} {item.result.fraud.score:>6} "
            f"{item.result.verdict:<18} {item.result.confidence:>5.2f}"
        )


def print_components(scored: list[Scored]) -> None:
    print("\n=== Stage 1 components (synthetic probability) ===")
    header = f"{'class':<8} {'file':<28} {'ast':>6} {'w2v2':>6} {'dsp':>6} {'disfl':>6} {'disagr':>7}"
    print(header)
    print("-" * len(header))
    for item in scored:
        if item.result is None:
            continue
        components = item.result.authenticity.components
        models = components.neural.models

        def fmt(value: float | None) -> str:
            return f"{value:.3f}" if value is not None else "  --"

        print(
            f"{item.label:<8} {item.path.name[:28]:<28} "
            f"{fmt(models.get('ast')):>6} {fmt(models.get('w2v2')):>6} "
            f"{fmt(components.dsp.score):>6} {fmt(components.disfluency.score):>6} "
            f"{fmt(components.neural.disagreement):>7}"
        )


def print_signals(scored: list[Scored]) -> None:
    """Mean suspicion per signal per class, so we can see which ones actually work."""
    keys: list[str] = []
    for item in scored:
        if item.result is None:
            continue
        for signal in item.result.authenticity.signals:
            if signal.key not in keys:
                keys.append(signal.key)
    if not keys:
        return

    print("\n=== Mean suspicion per signal (higher = looks more synthetic) ===")
    header = f"{'signal':<20}" + "".join(f"{label:>10}" for label in CLASSES) + f"{'gap':>9}"
    print(header)
    print("-" * len(header))

    for key in keys:
        means: dict[str, float | None] = {}
        for label in CLASSES:
            values = [
                signal.suspicion
                for item in scored
                if item.label == label and item.result
                for signal in item.result.authenticity.signals
                if signal.key == key and signal.suspicion is not None
            ]
            means[label] = sum(values) / len(values) if values else None

        row = f"{key:<20}"
        for label in CLASSES:
            value = means[label]
            row += f"{value:>10.3f}" if value is not None else f"{'--':>10}"

        fake_values = [means[c] for c in ("clone", "replay") if means[c] is not None]
        if means["real"] is not None and fake_values:
            gap = min(fake_values) - means["real"]
            row += f"{gap:>+9.3f}"
        else:
            row += f"{'--':>9}"
        print(row)
    print(
        "\nA signal with a negative or near-zero gap is not helping on our clips. "
        "Consider reducing its weight in calibration.json rather than pretending it works."
    )


def check_polarity(scored: list[Scored]) -> list[str]:
    """Verify that 'fake' really means fake for each neural model.

    An inverted label mapping flips every verdict in the product while still looking
    plausible, so this check is worth failing loudly over.
    """
    warnings: list[str] = []
    real = [i for i in scored if i.label == "real" and i.result]
    fake = [i for i in scored if i.label in {"clone", "replay"} and i.result]
    if not real or not fake:
        warnings.append(
            "Cannot verify label polarity without at least one real clip and one clone clip."
        )
        return warnings

    for model_key in ("ast", "w2v2"):
        real_values = [
            i.result.authenticity.components.neural.models.get(model_key)
            for i in real
            if i.result and i.result.authenticity.components.neural.models.get(model_key) is not None
        ]
        fake_values = [
            i.result.authenticity.components.neural.models.get(model_key)
            for i in fake
            if i.result and i.result.authenticity.components.neural.models.get(model_key) is not None
        ]
        if not real_values or not fake_values:
            continue
        real_mean = sum(real_values) / len(real_values)
        fake_mean = sum(fake_values) / len(fake_values)
        if fake_mean < real_mean:
            warnings.append(
                f"POLARITY: '{model_key}' scores real clips HIGHER ({real_mean:.3f}) than clones "
                f"({fake_mean:.3f}). Its labels are almost certainly inverted. Set "
                f"models.{model_key}.fake_index in calibration.json to the other index and re-run."
            )
    return warnings


def separation(scored: list[Scored]) -> tuple[int | None, int | None, int | None]:
    real = [i.authenticity for i in scored if i.label == "real" and i.authenticity is not None]
    fake = [
        i.authenticity
        for i in scored
        if i.label in {"clone", "replay"} and i.authenticity is not None
    ]
    if not real or not fake:
        return None, None, None
    max_real = max(real)
    min_fake = min(fake)
    return max_real, min_fake, min_fake - max_real


def suggest_thresholds(max_real: int, min_fake: int) -> dict[str, int]:
    """Put `review` just above the worst genuine clip, `high` just below the best fake."""
    review = max(10, min(max_real + 5, min_fake - 5))
    high = max(review + 10, min_fake - 3)
    return {"review": int(review), "high": int(min(99, high))}


def main() -> int:
    enable_utf8_console()
    parser = argparse.ArgumentParser(description="Calibrate VoxShield thresholds on our own clips.")
    parser.add_argument(
        "--dir",
        default=str(REPO_ROOT / "demo" / "audio"),
        help="Folder containing real/, clone/, and replay/ subfolders.",
    )
    parser.add_argument("--preset", default="standard", choices=["standard", "high_value"])
    parser.add_argument("--write", action="store_true", help="Write thresholds into calibration.json.")
    args = parser.parse_args()

    root = Path(args.dir).resolve()
    print(f"VoxShield calibration\n  clips:   {root}\n  profile: {settings.profile}")

    if not root.is_dir():
        print(f"\nFolder not found: {root}")
        print("Create it and add clips:")
        for label in CLASSES:
            print(f"  {root / label}")
        return 1

    clips = find_clips(root)
    counts = {label: len(paths) for label, paths in clips.items()}
    print(f"  found:   " + ", ".join(f"{label}={counts[label]}" for label in CLASSES))

    if counts["real"] == 0 or (counts["clone"] == 0 and counts["replay"] == 0):
        print("\nNeed at least one clip in real/ and one in clone/ or replay/ to calibrate.")
        return 1
    if counts["replay"] == 0:
        print(
            "\nWARNING: replay/ is empty. The live demo plays the clone through a phone\n"
            "speaker, which band-limits the audio and shifts every DSP signal. Thresholds\n"
            "calibrated only on clean downloads can look perfect here and fail in the hall."
        )

    scored: list[Scored] = []
    for label in CLASSES:
        for path in clips[label]:
            print(f"  scoring {label}/{path.name} ...", flush=True)
            scored.append(score_clip(path, label, args.preset))

    usable = [item for item in scored if item.result is not None]
    if not usable:
        print("\nNo clip could be scored. Check the errors above.")
        return 1

    print_scores(scored)
    print_components(scored)
    print_signals(scored)

    warnings = check_polarity(scored)
    if warnings:
        print("\n=== WARNINGS ===")
        for warning in warnings:
            print(f"  ! {warning}")

    max_real, min_fake, gap = separation(scored)
    print("\n=== Separation ===")
    if gap is None:
        print("  Not enough clips to measure separation.")
        return 1

    print(f"  highest genuine authenticity score: {max_real}")
    print(f"  lowest fake authenticity score:     {min_fake}")
    print(f"  separation gap:                     {gap:+d} points (target >= 25)")

    latencies = [item.result.meta.latency_ms for item in usable if item.result]
    if latencies:
        print(f"  latency: mean {sum(latencies) // len(latencies)} ms, max {max(latencies)} ms")

    if gap >= 25:
        suggestion = suggest_thresholds(max_real, min_fake)
        print(f"\n  PASS. Suggested authenticity thresholds: {suggestion}")
    else:
        suggestion = None
        print(
            "\n  FAIL. Separation is below 25 points.\n"
            "  Do NOT tune thresholds to hide this. Fix the signals or record better clips.\n"
            "  Check the per-signal table above to see which signals are not discriminating,\n"
            "  and the warnings for an inverted model label."
        )

    if args.write:
        if suggestion is None:
            print("\n  Refusing to write thresholds while separation is below target.")
            return 1
        data = load_calibration()
        data["thresholds"]["standard"]["authenticity"] = suggestion
        data["calibrated"] = True
        data["calibrated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        data["calibration_evidence"] = {
            "max_real": max_real,
            "min_fake": min_fake,
            "gap": gap,
            "counts": counts,
        }
        save_calibration(data)
        print(f"\n  Wrote thresholds to {CALIBRATION_PATH}")

    return 0 if gap >= 25 else 2


if __name__ == "__main__":
    sys.exit(main())
