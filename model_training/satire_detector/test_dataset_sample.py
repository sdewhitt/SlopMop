
from __future__ import annotations

import argparse
import csv
import io
import os
import random
import sys

import torch

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from satire_detector import SatireDetector  # noqa: E402


def _load_labeled_rows(csv_path: str) -> list[dict]:
    rows: list[dict] = []
    with open(csv_path, "r", encoding="utf-8") as f:
        raw_rows = list(csv.reader(f))

    start = 0
    if (
        raw_rows
        and len(raw_rows[0]) >= 2
        and raw_rows[0][0].strip().lower() == "text"
        and raw_rows[0][1].strip().lower() == "label"
    ):
        start = 1

    for row in raw_rows[start:]:
        if len(row) < 2:
            continue
        text = (row[0] or "").strip()
        raw_label = row[1]
        try:
            label = int(raw_label) if raw_label not in (None, "") else 0
        except (ValueError, TypeError):
            label = 0
        if text:
            rows.append({"text": text, "label": label})
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Run satire model on a sample from test_dataset.csv")
    parser.add_argument(
        "--count",
        type=int,
        default=40,
        help="Number of examples to run (30–50 typical). Capped by dataset size.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="RNG seed for which rows are sampled.",
    )
    parser.add_argument(
        "--csv",
        type=str,
        default=os.path.join(_SCRIPT_DIR, "test_dataset.csv"),
        help="Path to labeled CSV (text, label).",
    )
    parser.add_argument(
        "--weights",
        type=str,
        default=os.path.join(_SCRIPT_DIR, "best_satire_detector.pt"),
        help="Path to satire classifier state dict.",
    )
    args = parser.parse_args()

    csv_path = os.path.abspath(args.csv)
    weights_path = os.path.abspath(args.weights)

    if not os.path.isfile(csv_path):
        print(f"Error: CSV not found: {csv_path}")
        sys.exit(1)

    rows = _load_labeled_rows(csv_path)
    if not rows:
        print("Error: no rows loaded from CSV")
        sys.exit(1)

    n = max(1, min(args.count, len(rows)))
    random.seed(args.seed)
    sample = random.sample(rows, n) if n < len(rows) else list(rows)

    print("Loading SatireDetector...")
    detector = SatireDetector()
    if os.path.isfile(weights_path):
        state = torch.load(weights_path, map_location=detector.device, weights_only=False)
        detector.model.load_state_dict(state, strict=True)
        detector.model.eval()
        print(f"Loaded weights from {weights_path}\n")
    else:
        print(f"Warning: no weights at {weights_path} — using randomly initialized head.\n")

    # label in CSV: 1 = satire, 0 = non-satire (same as training)
    correct = 0
    for i, row in enumerate(sample):
        text = row["text"]
        true_label = row["label"]
        true_str = "satire" if true_label == 1 else "non_satire"

        pred_label, prob_satire = detector.predict(text, return_prob=True)

        match = (pred_label == "satire" and true_label == 1) or (
            pred_label == "non_satire" and true_label == 0
        )
        if match:
            correct += 1

        status = "✓" if match else "✗"
        snippet = text.replace("\n", " ")
        if len(snippet) > 72:
            snippet = snippet[:69] + "..."
        print(
            f"{status} [{i + 1}/{n}] true={true_str} pred={pred_label} "
            f"p_satire={prob_satire:.4f} | {snippet}"
        )

    acc = (correct / n) * 100 if n else 0.0
    print(f"\nAccuracy on sample: {correct}/{n} = {acc:.1f}%")
    print(f"(CSV: {csv_path}, seed={args.seed}, n={n})")


if __name__ == "__main__":
    main()
