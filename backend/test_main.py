from fastapi.testclient import TestClient
from main import app
import base64
import io
from PIL import Image

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
    payload = {"text": "In conclusion, furthermore, overall this should be flagged. Additionally, as an AI language model, I must note these common transition phrases."}
    response = client.post("/detect", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["label"] == "ai"
    assert data["confidence"] >= 0.5

def test_detect_rejects_whitespace_only_text():
    response = client.post("/detect", json={"text": "   "})
    assert response.status_code == 400
    assert "Text is required" in response.json()["detail"]


def test_detect_rejects_missing_text_field():
    response = client.post("/detect", json={})
    assert response.status_code == 422  # pydantic validation error


def test_detect_rejects_over_max_length_text():
    long_text = "a" * 5001
    response = client.post("/detect", json={"text": long_text})
    assert response.status_code == 400
    assert "at most 5000 characters" in response.json()["detail"]


# ── /detect-image tests ──────────────────────────────────────────

def _make_test_image_base64() -> str:
    """Create a small solid-color test image and return its base64 encoding."""
    img = Image.new("RGB", (224, 224), color=(128, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def test_detect_image_success():
    b64 = _make_test_image_base64()
    response = client.post("/detect-image", json={"image_base64": b64})
    assert response.status_code == 200
    data = response.json()
    assert "confidence" in data
    assert "label" in data
    assert "explanation" in data
    assert data["label"] in ["ai", "human"]
    assert 0.0 <= data["confidence"] <= 1.0


def test_detect_image_rejects_empty_base64():
    response = client.post("/detect-image", json={"image_base64": "   "})
    assert response.status_code == 400
    assert "image_base64 is required" in response.json()["detail"]


def test_detect_image_rejects_invalid_base64():
    response = client.post("/detect-image", json={"image_base64": "not-valid-image-data!!!"})
    assert response.status_code == 400
    assert "Invalid image data" in response.json()["detail"]


def test_detect_image_rejects_missing_field():
    response = client.post("/detect-image", json={})
    assert response.status_code == 422  # pydantic validation error