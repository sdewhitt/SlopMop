from __future__ import annotations

from typing import List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import sys
import os
import time
import base64
import io
from PIL import Image
import torch
from dotenv import load_dotenv

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))

# Load backend env vars from backend/.env for local development.
load_dotenv(os.path.join(_THIS_DIR, ".env"))

# Add nonescape's python package to the path so `from nonescape import ...` works
sys.path.insert(0, os.path.join(_THIS_DIR, "nonescape", "python"))
from nonescape import NonescapeClassifier, NonescapeClassifierMini, preprocess_image# type: ignore

# Add text model to path so we can import the detector class
sys.path.insert(0, os.path.join(_THIS_DIR, "..", "model_training", "text_model"))
from text_detector import TextDetectors # type: ignore

from fact_check import run_fact_check_for_text
from llm_fact_check import run_llm_fact_check_for_text
from gemini_wiki_fact_check import run_gemini_wiki_fact_check

app = FastAPI(title="SlopMop Detection API", version="0.1.0")

# allow all origins, credentials, methods, and headers 
# CORS so the extension can access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load image detection models once at startup ────────────────
IMAGE_MODEL_MINI_FILENAME = (
    os.environ.get("HF_IMAGE_MODEL_FILENAME", "nonescape-mini-v0.safetensors").strip()
    or "nonescape-mini-v0.safetensors"
)
IMAGE_MODEL_FULL_FILENAME = (
    os.environ.get("HF_IMAGE_MODEL_FULL_FILENAME", "nonescape-v0.safetensors").strip()
    or "nonescape-v0.safetensors"
)
HF_IMAGE_MODEL_REPO = os.environ.get("HF_IMAGE_MODEL_REPO", "").strip()
HF_IMAGE_MODEL_FULL_REPO = (
    os.environ.get("HF_IMAGE_MODEL_FULL_REPO", "").strip() or HF_IMAGE_MODEL_REPO
)


def _resolve_image_model_path(filename: str, repo_id: str) -> str:
    if repo_id:
        from huggingface_hub import hf_hub_download

        print(
            f"[SlopMop] Downloading image model from Hugging Face ({repo_id})...",
            flush=True,
        )
        model_path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=os.path.join(_THIS_DIR, "nonescape"),
        )
        print(f"[SlopMop] Image model downloaded: {model_path}", flush=True)
        return model_path

    return os.path.join(_THIS_DIR, "nonescape", filename)


MINI_MODEL_PATH = _resolve_image_model_path(IMAGE_MODEL_MINI_FILENAME, HF_IMAGE_MODEL_REPO)
image_model_mini = NonescapeClassifierMini.from_pretrained(MINI_MODEL_PATH)
image_model_mini.eval()
print(
    f"[SlopMop] Loaded image model (mini): {IMAGE_MODEL_MINI_FILENAME} ({MINI_MODEL_PATH})",
    flush=True,
)

image_model_full: Optional[NonescapeClassifier] = None
FULL_MODEL_PATH = ""
try:
    FULL_MODEL_PATH = _resolve_image_model_path(IMAGE_MODEL_FULL_FILENAME, HF_IMAGE_MODEL_FULL_REPO)
    full_model = NonescapeClassifier.from_pretrained(FULL_MODEL_PATH)
    full_model.eval()
    image_model_full = full_model
    print(
        f"[SlopMop] Loaded image model (full): {IMAGE_MODEL_FULL_FILENAME} ({FULL_MODEL_PATH})",
        flush=True,
    )
except Exception as exc:
    print(
        f"[SlopMop] WARNING: Full image model unavailable ({IMAGE_MODEL_FULL_FILENAME}): {exc}",
        flush=True,
    )

# ── Load text detection model once at startup ──────────────────
TEXT_MODEL_FILENAME = "best_text_detector_smaller.pt"
HF_TEXT_MODEL_REPO = os.environ.get("HF_TEXT_MODEL_REPO", "").strip()

if HF_TEXT_MODEL_REPO:
    from huggingface_hub import hf_hub_download
    print(f"[SlopMop] Downloading text model from Hugging Face ({HF_TEXT_MODEL_REPO})...", flush=True)
    TEXT_MODEL_WEIGHTS = hf_hub_download(
        repo_id=HF_TEXT_MODEL_REPO,
        filename=TEXT_MODEL_FILENAME,
        local_dir=os.path.join(_THIS_DIR, "..", "model_training", "text_model"),
    )
    print(f"[SlopMop] Text model downloaded: {TEXT_MODEL_WEIGHTS}", flush=True)
else:
    TEXT_MODEL_WEIGHTS = os.path.join(
        _THIS_DIR,
        "..",
        "model_training",
        "text_model",
        TEXT_MODEL_FILENAME,
    )

text_detector = TextDetectors()
if os.path.exists(TEXT_MODEL_WEIGHTS):
    state = torch.load(TEXT_MODEL_WEIGHTS, map_location=text_detector.device, weights_only=False)
    text_detector.model.load_state_dict(state, strict=True)
    text_detector.model.eval()
    print(f"Loaded text model weights from {TEXT_MODEL_WEIGHTS}")
else:
    print(f"WARNING: No text model weights at {TEXT_MODEL_WEIGHTS}, using base model")

MAX_TEXT_LENGTH = 5000
MAX_COMMENT_TEXTS = 50
MAX_COMMENT_SNIPPET_CHARS = 4000


def _span_mask_eval_cap() -> int:
    """Max masked tokens evaluated per request (batched into one forward pass)."""
    raw = os.environ.get("SPAN_MAX_MASK_EVALS", "24").strip()
    try:
        n = int(raw)
    except ValueError:
        n = 24
    return max(4, min(n, 128))


SPAN_MASK_EVAL_CAP = _span_mask_eval_cap()
print(
    f"[SlopMop] Span attribution: up to {SPAN_MASK_EVAL_CAP} mask passes per request "
    "(env SPAN_MAX_MASK_EVALS)",
    flush=True,
)


def _span_attribution_method() -> str:
    """mask = leave-one-token-out (slower); gradient = embedding saliency, one backward (faster)."""
    raw = os.environ.get("SPAN_ATTRIBUTION_METHOD", "mask").strip().lower()
    return raw if raw in ("mask", "gradient") else "mask"


SPAN_ATTRIBUTION_METHOD = _span_attribution_method()
print(
    f"[SlopMop] Span attribution method: {SPAN_ATTRIBUTION_METHOD} "
    "(env SPAN_ATTRIBUTION_METHOD=mask|gradient)",
    flush=True,
)


class DetectRequest(BaseModel):
    text: str
    # optional visible comment bodies (same post) for satire keyword / consensus heuristics on the main post score.
    comment_texts: Optional[List[str]] = None
    # optional: reddit community name (e.g. "shitposting") for hard satire allowlist overrides.
    subreddit: Optional[str] = None


class HighlightSpan(BaseModel):
    """Character span that contributed to the AI detection score."""
    start: int  # character offset (inclusive)
    end: int    # character offset (exclusive)
    score: float  # 0–1, contribution to AI confidence


class DetectResponse(BaseModel):
    confidence: float  # 0.0 = human, 1.0 = AI
    label: str  # "ai" or "human"
    explanation: str  # explanation for the detection
    highlights: List[HighlightSpan] = []  # spans for segment highlighting
    # Wall-clock timing (ms), optional for backward compatibility. Omitted when None (exclude_none).
    # /detect sets detect_ms + total_server_ms; fact_check_ms is for combined flows elsewhere only.
    detect_ms: Optional[int] = None
    fact_check_ms: Optional[int] = None
    total_server_ms: Optional[int] = None
    # Optional satire signal (from satire model and/or comment consensus heuristics).
    satire_score: Optional[float] = None
    satire_label: Optional[str] = None


class DetectImageRequest(BaseModel):
    image_base64: str          # raw base64-encoded image bytes
    mime_type: str = "image/jpeg"
    model_variant: Literal["mini", "full"] = "mini"


class DetectImageResponse(BaseModel):
    confidence: float          # 0.0 = authentic, 1.0 = AI-generated
    label: str                 # "ai" or "human"
    explanation: str
    model_variant: Literal["mini", "full"]
    detect_ms: Optional[int] = None
    fact_check_ms: Optional[int] = None
    total_server_ms: Optional[int] = None


class FactCheckRequest(BaseModel):
    text: str


class FactCheckItem(BaseModel):
    """One fact-check row (possibly from Claim Search index)."""
    query_text: str
    claim: str
    verdict: str
    source: str
    url: str


class FactCheckResponse(BaseModel):
    items: List[FactCheckItem]
    detect_ms: Optional[int] = None
    fact_check_ms: Optional[int] = None
    total_server_ms: Optional[int] = None


@app.get("/")
def root():
    return {"status": "ok", "message": "SlopMop Detection API"}

# normalize the comment texts
def _normalize_comment_texts(raw: Optional[List[str]]) -> Optional[List[str]]:
    if not raw:
        return None
    out: list[str] = []
    for c in raw:
        if not isinstance(c, str):
            continue
        s = c.strip()
        if not s:
            continue
        if len(s) > MAX_COMMENT_SNIPPET_CHARS:
            s = s[:MAX_COMMENT_SNIPPET_CHARS]
        out.append(s)
        if len(out) >= MAX_COMMENT_TEXTS:
            break
    return out or None


# helper function to score text and get segment highlights
def score_text_with_spans(
    text: str, comment_texts: Optional[List[str]] = None
) -> tuple[float, str, List[HighlightSpan]]:
    if SPAN_ATTRIBUTION_METHOD == "gradient":
        confidence, label, spans = text_detector.score_text_with_gradient_spans(
            text,
            clean=True,
            comment_texts=comment_texts,
        )
    else:
        confidence, label, spans = text_detector.score_text_with_spans(
            text,
            clean=True,
            max_tokens_to_evaluate=SPAN_MASK_EVAL_CAP,
            comment_texts=comment_texts,
        )
    if label == "mixed":
        label = "ai" if confidence >= 0.5 else "human"
    highlights = [HighlightSpan(start=s, end=e, score=sc) for s, e, sc in spans]
    return round(confidence, 4), label, highlights


def score_text_without_spans(text: str, comment_texts: Optional[List[str]] = None) -> tuple[float, str]:
    """Single forward pass; no token masking (faster)."""
    confidence, label = text_detector.calculate_confidence(
        text, clean=True, comment_texts=comment_texts
    )
    if label == "mixed":
        label = "ai" if confidence >= 0.5 else "human"
    return round(float(confidence), 4), label

def generate_explanation(confidence: float, label: str, text_char_len: int = 0) -> str:
    """
    User-facing copy for /detect. Scores come from model_training/text_model (DistilBERT + satire
    adjustments), not from mock keyword rules — older copy incorrectly said 'Mock heuristic'.
    """
    pct = round(float(confidence) * 100, 2)
    short_note = ""
    if 0 < text_char_len < 120:
        short_note = (
            " Very short text (e.g. titles like “Whoops!”) often gives noisy scores and odd token highlights; "
            "prefer analyzing the full post body when possible."
        )
    if label == "ai":
        return (
            f"SlopMop text classifier: {pct}% estimated AI-like (transformer + optional satire nudge).{short_note} "
            "Highlight segments show which tokens most affect the model score (attribution), not keyword rules."
        )
    return (
        f"SlopMop text classifier: {pct}% estimated AI-like; labeled human/mixed (below likely-AI band).{short_note}"
    )

@app.post("/detect", response_model=DetectResponse, response_model_exclude_none=True)
def detect(
    request: DetectRequest,
    include_spans: bool = Query(
        default=True,
        description="If false, skip segment attribution (one forward pass only).",
    ),
):
    t0 = time.perf_counter()
    # strip spaces from head and tail of text
    clean_text = request.text.strip()

    # return HTTP 400 if text is empty
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text is required")

    # return HTTP 400 if text is too long
    if len(clean_text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"text must be at most {MAX_TEXT_LENGTH} characters",
        )

    comment_texts = _normalize_comment_texts(request.comment_texts)

    t_detect_start = time.perf_counter()
    if include_spans:
        confidence, label, highlights = score_text_with_spans(clean_text, comment_texts)
    else:
        confidence, label = score_text_without_spans(clean_text, comment_texts)
        highlights = []
    t_detect_end = time.perf_counter()

    detect_ms = max(0, int((t_detect_end - t_detect_start) * 1000))
    total_server_ms = max(0, int((t_detect_end - t0) * 1000))

    explanation = generate_explanation(confidence, label, len(clean_text))

    # Satire metadata: if top comments confirm satire, force satire label.
    satire_score = None
    satire_label = None
    try:
        # 0) subreddit allowlist override (hard rule)
        sub = (request.subreddit or "").strip().lower()
        satire_subs = {
            "satire",
            "shitpost",
            "shitposts",
            "shitposting",
            "circlejerk",
            "copypasta",
            "parody",
        }
        if sub in satire_subs:
            satire_score = 1.0
            satire_label = "satire"
            print(f"[SlopMop Satire] subreddit override: r/{sub} -> satire", flush=True)

        scan = getattr(text_detector, "_get_satire_heuristic_scan", None)
        scan_fn = scan() if callable(scan) else None
        if callable(scan_fn):
            r = scan_fn(clean_text, comment_texts)
            reason = getattr(r, "consensus_reason", None)
            if reason == "top3_2of3":
                satire_score = 1.0
                satire_label = "satire"
                print(f"[SlopMop Satire] top comments: confirmed satire (reason={reason})", flush=True)
        # If not confirmed by comments, expose neural satire probability when available.
        if satire_label is None:
            ps = getattr(text_detector, "_satire_prob_satire", None)
            ps_val = ps(clean_text) if callable(ps) else None
            if ps_val is not None:
                satire_score = float(ps_val)
                satire_label = "satire" if satire_score >= 0.5 else "non_satire"
    except Exception as e:
        print(f"[SlopMop Satire] failed to attach satire metadata: {e}", flush=True)

    return DetectResponse(
        confidence=confidence,
        label=label,
        explanation=explanation,
        highlights=highlights,
        detect_ms=detect_ms,
        total_server_ms=total_server_ms,
        satire_score=satire_score,
        satire_label=satire_label,
    )


@app.post("/detect-image", response_model=DetectImageResponse, response_model_exclude_none=True)
def detect_image(request: DetectImageRequest):
    t0 = time.perf_counter()
    raw = request.image_base64.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="image_base64 is required")

    try:
        img_bytes = base64.b64decode(raw)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data")

    tensor = preprocess_image(image).unsqueeze(0)  # add batch dim

    selected_variant = request.model_variant
    if selected_variant == "full":
        if image_model_full is None:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Full image model is not available on this backend instance. "
                    "Retry with model_variant='mini' or configure "
                    "HF_IMAGE_MODEL_FULL_FILENAME/HF_IMAGE_MODEL_FULL_REPO."
                ),
            )
        selected_model = image_model_full
        model_name = "Nonescape"
    else:
        selected_model = image_model_mini
        model_name = "Nonescape-mini"

    t_detect_start = time.perf_counter()
    with torch.no_grad():
        probs = selected_model(tensor)
        authentic_prob = probs[0][0].item()
        ai_prob = probs[0][1].item()
    t_detect_end = time.perf_counter()

    detect_ms = max(0, int((t_detect_end - t_detect_start) * 1000))
    total_server_ms = max(0, int((t_detect_end - t0) * 1000))

    label = "ai" if ai_prob > 0.5 else "human"
    confidence = round(ai_prob, 4)
    explanation = (
        f"{model_name} classified this image as {'AI-generated' if label == 'ai' else 'authentic'} "
        f"with {confidence:.1%} confidence."
    )

    return DetectImageResponse(
        confidence=confidence,
        label=label,
        explanation=explanation,
        model_variant=selected_variant,
        detect_ms=detect_ms,
        total_server_ms=total_server_ms,
    )


def _fact_check_http_error(err: str) -> HTTPException:
    """Map provider error strings to HTTP status for the extension."""
    low = err.lower()
    if "rate limit" in low:
        return HTTPException(status_code=429, detail=err)
    if (
        "not configured" in low
        or "missing api key" in low
        or "missing openai" in low
        or "missing gemini" in low
        or "check openai_api_key" in low
    ):
        return HTTPException(status_code=503, detail=err)
    if "authentication failed" in low or "check gemini_api_key" in low:
        return HTTPException(status_code=503, detail=err)
    return HTTPException(status_code=502, detail=err)


@app.post("/fact-check", response_model=FactCheckResponse, response_model_exclude_none=True)
async def fact_check(request: FactCheckRequest):
    """
    Fact-check post text. Backend is selected with FACT_CHECK_MODE:

    - ``google`` (default): Claim Search API, chunked queries (see FACT_CHECK.md).
    - ``llm``: OpenAI JSON output; same response shape; not a substitute for real fact databases.
    """
    t0 = time.perf_counter()
    raw = request.text.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="text is required")
    if len(raw) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"text must be at most {MAX_TEXT_LENGTH} characters",
        )

    mode = os.environ.get("FACT_CHECK_MODE", "google").strip().lower()
    t_fc_start = time.perf_counter()
    if mode == "llm":
        items_raw, err = await run_llm_fact_check_for_text(raw)
    elif mode in ("gemini_wiki", "gemini-wiki", "gemini"):
        items_raw, err = await run_gemini_wiki_fact_check(raw)
    else:
        key = os.environ.get("GOOGLE_FACT_CHECK_API_KEY", "").strip()
        items_raw, err = await run_fact_check_for_text(raw, api_key=key or None)
    t_fc_end = time.perf_counter()

    if err:
        raise _fact_check_http_error(err)

    fact_check_ms = max(0, int((t_fc_end - t_fc_start) * 1000))
    total_server_ms = max(0, int((t_fc_end - t0) * 1000))

    items = [FactCheckItem(**row) for row in items_raw]
    return FactCheckResponse(
        items=items,
        fact_check_ms=fact_check_ms,
        total_server_ms=total_server_ms,
    )
