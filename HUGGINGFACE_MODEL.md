# Publish ONNX Model to Hugging Face Hub

Use this when you don’t want to store the large ONNX file in the repo (e.g. Git LFS limit reached). The backend can download the model from Hugging Face at startup.

---

## Step 1: Create a Hugging Face account and repo

1. Sign up or log in at [huggingface.co](https://huggingface.co).
2. Click your profile (top right) → **New model**.
3. Create a new model repo, e.g. `slopmop-text-detector` (or `your-username/slopmop-text-detector`).
4. Choose **Public** (or Private; then add **HF_TOKEN** in Render with a token that has read access).

---

## Step 2: Install Hugging Face CLI and log in

```powershell
pip install huggingface_hub
huggingface-cli login
```

When prompted, paste a **User Access Token** from: [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) (create one with “Read” and “Write” if you’ll upload from this machine).

---

## Step 3: Upload the ONNX file

From the **SlopMop repo root**:

```powershell
cd c:\Users\aryr5\OneDrive\Documents\CS307\SlopMop
```

**Option A – CLI (recommended):**

```powershell
huggingface-cli upload YOUR_USERNAME/slopmop-text-detector model_training/text_model/text_detector.onnx text_detector.onnx
```

Replace `YOUR_USERNAME` with your Hugging Face username. The file will appear in the repo as `text_detector.onnx`.

**Option B – Python one-liner:**

```powershell
python -c "
from huggingface_hub import HfApi
api = HfApi()
api.upload_file(path_or_fileobj='model_training/text_model/text_detector.onnx', path_in_repo='text_detector.onnx', repo_id='YOUR_USERNAME/slopmop-text-detector', repo_type='model')
"
```

Again replace `YOUR_USERNAME` with your Hugging Face username.

---

## Step 4: Use the model in the backend

The backend already supports loading from Hugging Face when `HF_MODEL_REPO` is set.

**Local run:**

```powershell
cd backend
$env:HF_MODEL_REPO = "YOUR_USERNAME/slopmop-text-detector"
uvicorn main:app --reload
```

**Render:**

1. In the Render dashboard → your **slopmop** web service → **Environment**.
2. Add a variable:
   - **Key:** `HF_MODEL_REPO`
   - **Value:** `YOUR_USERNAME/slopmop-text-detector`
3. Save. The next deploy will download the ONNX from Hugging Face at startup (no need to ship the file in the repo or use Git LFS).

---

## Step 5 (optional): Stop tracking the model in Git

If the model is currently in the repo (or LFS) and you no longer want it there:

1. Remove the file from the repo (keeps it only on Hugging Face):
   ```powershell
   git rm --cached backend/model/text_detector.onnx
   # If you use LFS:
   git rm --cached backend/model/text_detector.onnx
   ```
2. Add `backend/model/text_detector.onnx` to `.gitignore` so it isn’t re-added (the backend will create this folder when it downloads from HF).
3. Commit and push:
   ```powershell
   git add .gitignore
   git commit -m "Load ONNX from Hugging Face; remove model from repo"
   git push
   ```

---

## Summary

| Step | Action |
|------|--------|
| 1 | Create model repo on huggingface.co |
| 2 | `pip install huggingface_hub` and `huggingface-cli login` |
| 3 | `huggingface-cli upload YOUR_USERNAME/slopmop-text-detector model_training/.../text_detector.onnx text_detector.onnx` |
| 4 | Set `HF_MODEL_REPO=YOUR_USERNAME/slopmop-text-detector` locally and on Render |
| 5 | (Optional) Remove `backend/model/text_detector.onnx` from Git and add to `.gitignore` |

If `HF_MODEL_REPO` is not set, the backend still uses a local file at `backend/model/text_detector.onnx` if present.
