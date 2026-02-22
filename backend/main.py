from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="SlopMop Detection API", version="0.1.0")


class DetectRequest(BaseModel):
    text: str


class DetectResponse(BaseModel):
    confidence: float  # 0.0 = human, 1.0 = AI
    label: str  # "ai" or "human"


@app.get("/")
def root():
    return {"status": "ok", "message": "SlopMop Detection API"}


@app.post("/detect", response_model=DetectResponse)
def detect(request: DetectRequest):
    # strip spaces from head and tail of text
    clean_text = request.text.strip()

    # Return HTTP 400 if text is empty
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text is required")

    # convert text to lowercase for mock heuristic
    clean_lowered_text = clean_text.lower()

    # count ai-ish phrases using a list of common ai-ish phrases
    ai_markers = ["in conclusion", "furthermore", "overall", "additionally", "as an ai"]
    marker_count = sum(1 for marker in ai_markers if marker in clean_lowered_text)

    # base confidence is 0.45 then increases by 0.1 for each ai marker found
    confidence = 0.45 + (marker_count * 0.1)
    confidence = max(0.0, min(confidence, 0.99))

    # label is "ai" if confidence is >= 0.6
    label = "ai" if confidence >= 0.6 else "human"

    # Connect to model here in week 2 of sprint 1
    return DetectResponse(confidence=round(confidence, 2), label=label)
