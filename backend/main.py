from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="SlopMop Detection API", version="0.1.0")

# constants
MAX_TEXT_LENGTH = 5000


class DetectRequest(BaseModel):
    text: str


class DetectResponse(BaseModel):
    confidence: float  # 0.0 = human, 1.0 = AI
    label: str  # "ai" or "human"


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

@app.post("/detect", response_model=DetectResponse)
def detect(request: DetectRequest):
    # strip spaces from head and tail of text
    clean_text = request.text.strip()

    # Return HTTP 400 if text is empty
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text is required")

    if len(clean_text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"text must be at most {MAX_TEXT_LENGTH} characters",
        )
    
    # connect to model here in week 2 of sprint 1
    confidence, label = score_text(clean_text)
    return DetectResponse(confidence=confidence, label=label)
    
