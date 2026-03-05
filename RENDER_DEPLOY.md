# Deploy SlopMop Backend to Render

## Prerequisites
- **Either:** FP16 model in `backend/model/text_detector.onnx` (~830 MB, with Git LFS), **or** model published on Hugging Face Hub (see [HUGGINGFACE_MODEL.md](HUGGINGFACE_MODEL.md)) and `HF_MODEL_REPO` set on Render
- If using repo: Git LFS installed (`git lfs install`)
- GitHub repo connected to Render

---

## Step 1: Prepare the repo

### 1.1 Ensure .gitignore excludes venv and cache
The project `.gitignore` should include:
```
venv/
.venv/
__pycache__/
.env
```

### 1.2 Verify backend structure
```
SlopMop/
├── backend/
│   ├── main.py
│   ├── detector.py
│   ├── preprocess.py
│   ├── requirements.txt
│   └── model/
│       └── text_detector.onnx   # FP16, ~830 MB
├── render.yaml
└── ...
```

### 1.3 Ensure model is in backend
```powershell
# Copy FP16 model (if not already done)
Copy-Item "model_training\text_model\text_detector.onnx" "backend\model\text_detector.onnx" -Force

# Remove old .onnx.data if present
Remove-Item "backend\model\text_detector.onnx.data" -ErrorAction SilentlyContinue
```

---

## Step 2: Git – push to backend-new

```powershell
cd c:\Users\aryr5\OneDrive\Documents\CS307\SlopMop

# Check status
git status

# Stage changes (venv and __pycache__ are ignored)
git add .gitignore
git add backend/
git add render.yaml
git add model_training/text_model/export_to_onnx.py
git add model_training/text_model/requirements.txt

# Commit
git commit -m "Deploy FP16 ONNX backend to Render"

# Push to backend-new
git push origin backend-new
```

**Note:** The 830 MB model is tracked by Git LFS. Ensure `git lfs install` has been run and that `.gitattributes` contains:
```
backend/model/*.onnx* filter=lfs diff=lfs merge=lfs -text
```

---

## Step 3: Render Dashboard setup

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. **New** → **Web Service**
3. Connect your GitHub repo (SlopMop)
4. Configure:
   - **Name:** `slopmop-api` (or your choice)
   - **Region:** Choose closest to users
   - **Branch:** `backend-new`
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** Standard (2 GB RAM) or higher – required for the ONNX model

5. **If using Hugging Face** (no model in repo): add **HF_MODEL_REPO** = `YOUR_USERNAME/slopmop-text-detector` and **HF_ONNX_FILENAME** = `text_detector_fp32.onnx` (see [HUGGINGFACE_MODEL.md](HUGGINGFACE_MODEL.md)).
6. **Create Web Service**

---

## Step 4: After deploy

1. Copy the service URL (e.g. `https://slopmop-api-xxxx.onrender.com`)
2. Update the extension `.env`:
   ```
   VITE_API_BASE_URL=https://slopmop-api-xxxx.onrender.com
   ```
3. Rebuild the extension and test

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| OOM / Out of memory | Upgrade to Standard (2 GB) or higher |
| Cold starts (first request slow) | Set min instances to 1 in Render (costs more) |
| Model file missing / FileNotFoundError | Add Git LFS fetch to build command (see below) |
| 503 on first request | Wait 30–60 s for model load, then retry |

### If the model file is missing (Git LFS)

Render may not fetch LFS files by default. If you see `FileNotFoundError` for the ONNX model, update the **Build Command** in Render to:

```bash
apt-get update && apt-get install -y git-lfs && cd .. && git lfs pull && cd backend && pip install -r requirements.txt
```

This installs Git LFS, fetches the model, then installs Python deps.
