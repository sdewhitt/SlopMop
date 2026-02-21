from fastapi import FastAPI
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
    """Mock endpoint: returns hardcoded result. Replace with real model later."""
    # TODO: wire to model_training / exported model
    return DetectResponse(confidence=0.12, label="human")
