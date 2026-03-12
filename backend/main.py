from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import sys
import os
import base64
import io
from PIL import Image
import torch

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))

# Add nonescape's python package to the path so `from nonescape import ...` works
sys.path.insert(0, os.path.join(_THIS_DIR, "nonescape", "python"))
from nonescape import NonescapeClassifierMini, preprocess_image# type: ignore

# Add text model to path so we can import the detector class
sys.path.insert(0, os.path.join(_THIS_DIR, "..", "model_training", "text_model"))
from text_detector import TextDetectors # type: ignore

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

# ── Load image detection model once at startup ─────────────────
IMAGE_MODEL_FILENAME = os.environ.get("HF_IMAGE_MODEL_FILENAME", "nonescape-mini-v0.safetensors").strip() or "nonescape-mini-v0.safetensors"
HF_IMAGE_MODEL_REPO = os.environ.get("HF_IMAGE_MODEL_REPO", "").strip()

if HF_IMAGE_MODEL_REPO:
    from huggingface_hub import hf_hub_download
    print(f"[SlopMop] Downloading image model from Hugging Face ({HF_IMAGE_MODEL_REPO})...", flush=True)
    MODEL_PATH = hf_hub_download(
        repo_id=HF_IMAGE_MODEL_REPO,
        filename=IMAGE_MODEL_FILENAME,
        local_dir=os.path.join(_THIS_DIR, "nonescape"),
    )
    print(f"[SlopMop] Image model downloaded: {MODEL_PATH}", flush=True)
else:
    MODEL_PATH = os.path.join(
        _THIS_DIR,
        "nonescape",
        IMAGE_MODEL_FILENAME,
    )

image_model = NonescapeClassifierMini.from_pretrained(MODEL_PATH)
image_model.eval()

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
    state = torch.load(TEXT_MODEL_WEIGHTS, map_location=text_detector.device)
    text_detector.model.load_state_dict(state, strict=True)
    text_detector.model.eval()
    print(f"Loaded text model weights from {TEXT_MODEL_WEIGHTS}")
else:
    print(f"WARNING: No text model weights at {TEXT_MODEL_WEIGHTS}, using base model")

MAX_TEXT_LENGTH = 5000


class DetectRequest(BaseModel):
    text: str


class DetectResponse(BaseModel):
    confidence: float  # 0.0 = human, 1.0 = AI
    label: str  # "ai" or "human"
    explanation: str  # explanation for the detection


class DetectImageRequest(BaseModel):
    image_base64: str          # raw base64-encoded image bytes
    mime_type: str = "image/jpeg"


class DetectImageResponse(BaseModel):
    confidence: float          # 0.0 = authentic, 1.0 = AI-generated
    label: str                 # "ai" or "human"
    explanation: str


@app.get("/")
def root():
    return {"status": "ok", "message": "SlopMop Detection API"}


# helper function to score text using the trained model
def score_text(text: str) -> tuple[float, str]:
    confidence, label = text_detector.calculate_confidence(text, clean=True)
    # calculate_confidence returns float 0..1 and label "human"/"mixed"/"ai"
    # normalize label to "ai" or "human" for the API response
    if label == "mixed":
        label = "ai" if confidence >= 0.5 else "human"
    return round(confidence, 4), label

def generate_explanation(confidence: float, label: str) -> str:
    if label == "ai":
        return (
            f"Mock heuristic flagged this as AI-like with confidence {confidence}. "
            "The text contains multiple transition-style phrases commonly seen in generated writing."
        )
    return (
        f"Mock heuristic flagged this as human-like with confidence {confidence}. "
        "The text contains few AI-style marker phrases based on current rules."
    )

@app.post("/detect", response_model=DetectResponse)
def detect(request: DetectRequest):
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
    
    # connect to model here in week 2 of sprint 1
    confidence, label = score_text(clean_text)
    explanation = generate_explanation(confidence, label)
    return DetectResponse(confidence=confidence, label=label, explanation=explanation)


@app.post("/detect-image", response_model=DetectImageResponse)
def detect_image(request: DetectImageRequest):
    raw = request.image_base64.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="image_base64 is required")

    try:
        img_bytes = base64.b64decode(raw)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data")

    tensor = preprocess_image(image).unsqueeze(0)  # add batch dim

    with torch.no_grad():
        probs = image_model(tensor)
        authentic_prob = probs[0][0].item()
        ai_prob = probs[0][1].item()

    label = "ai" if ai_prob > 0.5 else "human"
    confidence = round(ai_prob, 4)
    explanation = (
        f"Nonescape-mini classified this image as {'AI-generated' if label == 'ai' else 'authentic'} "
        f"with {confidence:.1%} confidence."
    )

    return DetectImageResponse(confidence=confidence, label=label, explanation=explanation)
