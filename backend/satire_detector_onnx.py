"""
ONNX-based satire detection.

Loads model_training/satire_detector/satire_detector.onnx and runs a simple
DistilBERT tokenizer pipeline similar to the training-time sarcasm preprocessing
used in model_training/satire_detector.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional, Tuple

import regex

_BACKEND_DIR = Path(__file__).resolve().parent
_MODEL_DIR = _BACKEND_DIR.parent / "model_training" / "satire_detector"
_ONNX_PATH = _MODEL_DIR / "satire_detector.onnx"

_session = None
_tokenizer = None


def _preprocess_text(text: str) -> str:
    """Light preprocessing aligned with preprocess_text_sarcasm."""
    if not text or not isinstance(text, str):
        return ""
    text = re.sub(
        r"\b(?:https?://|www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/[^\s]*[a-zA-Z0-9/_-])?",
        "",
        text,
    )
    text = re.sub(r"<[^>]*>", "", text)
    # Remove emoji (keeps /s, hashtags, punctuation cues)
    emoji_pattern = regex.compile(r"\p{Emoji}", flags=regex.UNICODE)
    text = emoji_pattern.sub("", text)
    text = re.sub(r"\n+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _load_model() -> bool:
    """Lazy-load ONNX session and tokenizer."""
    global _session, _tokenizer
    if _session is not None and _tokenizer is not None:
        return True

    if not _ONNX_PATH.exists():
        return False

    try:
        import onnxruntime as ort
        from transformers import AutoTokenizer

        _session = ort.InferenceSession(
            str(_ONNX_PATH),
            providers=["CPUExecutionProvider"],
        )
        _tokenizer = AutoTokenizer.from_pretrained("distilbert-base-uncased")
        return True
    except Exception:
        _session = None
        _tokenizer = None
        return False


def predict_satire(text: str) -> Optional[Tuple[float, str, str]]:
    """
    Returns (satire_score, label, explanation) or None if model unavailable.

    `satire_score` is softmax probability of the satire class (index 1).
    """
    if not _load_model() or _session is None or _tokenizer is None:
        return None

    try:
        import numpy as np

        cleaned = _preprocess_text(text)
        if not cleaned:
            cleaned = (text or "").strip() or " "

        enc = _tokenizer(
            cleaned,
            padding="max_length",
            truncation=True,
            max_length=512,
            return_tensors="np",
        )
        input_ids = enc["input_ids"].astype(np.int64)
        attention_mask = enc["attention_mask"].astype(np.int64)

        outputs = _session.run(
            None,
            {"input_ids": input_ids, "attention_mask": attention_mask},
        )
        logits = outputs[0]  # (1, 2)

        exp_logits = np.exp(logits - np.max(logits, axis=1, keepdims=True))
        probs = exp_logits / exp_logits.sum(axis=1, keepdims=True)
        score = float(probs[0, 1])

        label = "satire" if score >= 0.5 else "non_satire"
        pct = round(score * 100, 2)
        explanation = (
            f"SlopMop satire classifier: {pct}% satire-likelihood (ONNX DistilBERT)."
        )
        return (round(score, 4), label, explanation)
    except Exception:
        return None

