from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import sys
import os
import base64
import io
from PIL import Image
import torch

# Add nonescape's python package to the path so `from nonescape import ...` works
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "nonescape", "python"))
from nonescape import NonescapeClassifierMini, preprocess_image

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
MODEL_PATH = os.path.join(
    os.path.dirname(__file__),
    "nonescape",
    "nonescape-mini-v0.safetensors",
)

image_model = NonescapeClassifierMini.from_pretrained(MODEL_PATH)
image_model.eval()

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


# helper function to score text
def score_text(text:str) -> tuple[float, str]:
    # convert text to lowercase for mock heuristic
    clean_lowered_text = text.lower()

    # count ai-ish phrases using a list of common ai-ish phrases
    ai_markers = ["in conclusion", "furthermore", "overall", "additionally", "as an ai"]
    marker_count = sum(1 for marker in ai_markers if marker in clean_lowered_text)

    # base confidence is 0.45 then increases by 0.1 for each ai marker found
    confidence = 0.45 + (marker_count * 0.1)
    confidence = max(0.0, min(confidence, 0.99))
    confidence = round(confidence, 2)

    # label is "ai" if confidence is >= 0.6
    label = "ai" if confidence >= 0.6 else "human"
    return confidence, label

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
