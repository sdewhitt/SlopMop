"""
ONNX based AI text detector for SlopMop backend
Loads the model and tokenizer at startup and exposes a detect() function.
"""

import os
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer
from preprocess import preprocess_text

# Path to ONNX model (relative to this file)
_MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")
ONNX_PATH = os.path.join(_MODEL_DIR, "text_detector.onnx")
MODEL_NAME = "desklib/ai-text-detector-v1.01"
MAX_LENGTH = 512

# Loaded at module import
_session: ort.InferenceSession | None = None
_tokenizer: AutoTokenizer | None = None
_load_error: str | None = None


def _load_model() -> None:
    """Load ONNX session and tokenizer. Called once at startup."""
    global _session, _tokenizer, _load_error
    try:
        if not os.path.exists(ONNX_PATH):
            raise FileNotFoundError(f"ONNX model not found at {ONNX_PATH}")
        _session = ort.InferenceSession(
            ONNX_PATH,
            providers=["CPUExecutionProvider"],
        )
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    except Exception as e:
        _load_error = str(e)
        _session = None
        _tokenizer = None


def detect(text: str) -> float:
    """
    Run AI detection on text. Returns confidence (0.0 = human, 1.0 = AI).
    Raises RuntimeError if the model failed to load.
    """
    if _load_error:
        raise RuntimeError(f"Model failed to load: {_load_error}")
    if _session is None or _tokenizer is None:
        raise RuntimeError("Model not loaded")

    cleaned = preprocess_text(text)
    if not cleaned.strip():
        return 0.5

    enc = _tokenizer(
        cleaned,
        padding="max_length",
        truncation=True,
        max_length=MAX_LENGTH,
        return_tensors="np",
    )
    input_ids = enc["input_ids"].astype(np.int64)
    attention_mask = enc["attention_mask"].astype(np.int64)

    outputs = _session.run(
        ["logits"],
        {"input_ids": input_ids, "attention_mask": attention_mask},
    )
    logits_arr = np.asarray(outputs[0]).flatten()
    logit = float(logits_arr[0])
    prob = 1.0 / (1.0 + np.exp(-logit))
    return round(float(prob), 4)


# Load on import
_load_model()