from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "message" in data

def test_detect_success_human_text():
    payload = {"text": "hello team, meeting at 3pm"}
    response = client.post("/detect", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert "confidence" in data
    assert "label" in data
    assert "explanation" in data
    assert data["label"] in ["ai", "human"]


def test_detect_success_ai_marker_text():
    payload = {"text": "In conclusion, furthermore, overall this should be flagged."}
    response = client.post("/detect", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["label"] == "ai"
    assert data["confidence"] >= 0.6