## Slop Mop - Backend

This backend provides a FastAPI detection API used by the extension.

Current status:
- Uses mock/heuristic scoring (not final model inference yet)
- Returns confidence, label, and explanation for text input

### Tech Stack

- FastAPI
- Uvicorn
- Pytest

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
  "confidence": 0.75,
  "label": "ai",
  "explanation": "..."
}
```

### Validation Behavior

- Empty/whitespace text -> `400`
- Text longer than 5000 characters -> `400`
- Missing `text` field -> `422`

### Run Tests

```bash
python -m pytest -q
```

### Notes

- Explanation logic is currently heuristic and will be replaced by model-based inference later.
- Keep response keys stable for extension integration: `confidence`, `label`, `explanation`.
SlopMop Backend API (Sprint 1 Week 1 MVP)