from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from detector import detect as model_detect

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

MAX_TEXT_LENGTH = 5000


class DetectRequest(BaseModel):
    text: str


class DetectResponse(BaseModel):
    confidence: float  # 0.0 = human, 1.0 = AI (percentage AI)
    label: str  # "likely_ai" | "leaning_ai" | "uncertain" | "leaning_human" | "likely_human"
    explanation: str  # explanation aligned with confidence range (Sprint 14/15/18)


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

# Confidence ranges per Sprint 1 (Stories 14, 15, 18): high AI ≥70%, uncertain 40–60%, high human ≤30%
def get_confidence_label(confidence: float) -> str:
    if confidence >= 0.70:
        return "likely_ai"
    if confidence >= 0.60:
        return "leaning_ai"
    if confidence >= 0.40:
        return "uncertain"
    if confidence >= 0.30:
        return "leaning_human"
    return "likely_human"


def generate_explanation(confidence: float, label: str) -> str:
    pct = round(confidence * 100)
    if label == "likely_ai":
        return (
            f"High likelihood of AI-generated content ({pct}%). "
            "The text exhibits patterns commonly seen in AI-generated writing."
        )
    if label == "leaning_ai":
        return (
            f"Moderate likelihood of AI-generated content ({pct}%). "
            "Some patterns suggest AI involvement; result is not high-confidence."
        )
    if label == "uncertain":
        return (
            f"Uncertain or mixed ({pct}%). "
            "The result is inconclusive; the text may be AI-generated, human-written, or a mix."
        )
    if label == "leaning_human":
        return (
            f"Moderate likelihood of human-written content ({pct}% AI). "
            "Some patterns suggest human authorship; result is not high-confidence."
        )
    # likely_human
    return (
        f"High likelihood of human-written content ({pct}% AI). "
        "The text exhibits patterns commonly seen in human writing."
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
    
    try:
        confidence = model_detect(clean_text)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    label = get_confidence_label(confidence)
    explanation = generate_explanation(confidence, label)
    return DetectResponse(confidence=confidence, label=label, explanation=explanation)
    
