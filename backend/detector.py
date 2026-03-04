"""
ONNX based AI text detector for SlopMop backend
Loads the model and tokenizer at startup and exposes a detect() function.
Model can be loaded from local backend/model/ or from Hugging Face Hub (set HF_MODEL_REPO).
"""

import os
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer
from preprocess import preprocess_text

# Path to ONNX model (relative to this file) when using local file
_MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")
ONNX_FILENAME = "text_detector.onnx"
LOCAL_ONNX_PATH = os.path.join(_MODEL_DIR, ONNX_FILENAME)
MODEL_NAME = "desklib/ai-text-detector-v1.01"
MAX_LENGTH = 512

# Loaded at module import
_session: ort.InferenceSession | None = None
_tokenizer: AutoTokenizer | None = None
_load_error: str | None = None


def _get_onnx_path() -> str:
    """Resolve ONNX path: from Hugging Face Hub if HF_MODEL_REPO set, else local."""
    repo_id = os.environ.get("HF_MODEL_REPO", "").strip()
    if repo_id:
        from huggingface_hub import hf_hub_download
        return hf_hub_download(
            repo_id=repo_id,
            filename=ONNX_FILENAME,
            local_dir=_MODEL_DIR,
            local_dir_use_symlinks=False,
        )
    return LOCAL_ONNX_PATH


def _load_model() -> None:
    """Load ONNX session and tokenizer. Called once at startup."""
    global _session, _tokenizer, _load_error
    try:
        onnx_path = _get_onnx_path()
        if not os.path.exists(onnx_path):
            raise FileNotFoundError(f"ONNX model not found at {onnx_path}")
        _session = ort.InferenceSession(
            onnx_path,
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