## Slop Mop - Backend

### Render deployment url
https://slopmop.onrender.com

This backend provides a FastAPI detection API used by the extension.

Current status:
- Uses a DistilBERT-based ONNX model for text detection
- Returns confidence (0–1 = percentage AI), label (range-based), and explanation aligned with Sprint 1 ranges

### Tech Stack

- FastAPI
- Uvicorn
- Pytest
- ONNX Runtime
- Hugging Face Hub

### Setup

Run from the `backend` directory:

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

### Run Locally

```bash
uvicorn main:app --reload
```

Backend URL:
- `http://127.0.0.1:8000`

Swagger docs:
- `http://127.0.0.1:8000/docs`

### Detect using the Render URL

Example request against the deployed API:

```bash
curl -X POST "https://slopmop.onrender.com/detect" -H "Content-Type: application/json" -d "{\"text\": \"Your text to classify here.\"}"
```

PowerShell:

```powershell
$body = @{ text = "Your text to classify here." } | ConvertTo-Json
Invoke-RestMethod -Uri "https://slopmop.onrender.com/detect" -Method Post -Body $body -ContentType "application/json"
```

First request after idle may be slower while the service wakes.

### API Endpoints

`GET /`
- Health check endpoint

`POST /detect`
- Request body:

```json
{ "text": "sample text" }
```

- Response shape:

```json
{
  "confidence": 0.72,
  "label": "likely_ai",
  "explanation": "High likelihood of AI-generated content (72%). The text exhibits patterns commonly seen in AI-generated writing."
}
```

### Confidence ranges and labels

| Range (confidence) | Label           | Meaning                    |
|--------------------|-----------------|----------------------------|
| ≥ 0.70             | `likely_ai`     | High likelihood AI-generated |
| 0.60 – 0.70        | `leaning_ai`    | Moderate likelihood AI     |
| 0.40 – 0.60        | `uncertain`     | Inconclusive / mixed       |
| 0.30 – 0.40        | `leaning_human` | Moderate likelihood human  |
| &lt; 0.30          | `likely_human`  | High likelihood human-written |

Explanations are generated from these ranges (e.g. “High likelihood of AI-generated content”, “Uncertain or mixed”, “High likelihood of human-written content”).

### Validation Behavior

- Empty/whitespace text -> `400`
- Text longer than 5000 characters -> `400`
- Missing `text` field -> `422`

### Run Tests

```bash
python -m pytest -q
```
