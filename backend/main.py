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
    
    # mock endpoint: returns hardcoded result
    # Connect to model here in week 2 of sprint 1
    return DetectResponse(confidence=0.12, label="human")
