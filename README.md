# SlopMop

Realtime social media AI-detection browser extension

## Models

### SlopMop Text-Detector

A custom PyTorch-based text classification model trained to detect AI-generated content. The model uses transformer architectures from the Hugging Face `transformers` library and achieves high accuracy on detecting text produced by language models.

**Location:** `model_training/text_model/`

**Training & Development:**

```bash
cd model_training/text_model/

# Install dependencies
pip install -r requirements.txt

# Monitor training progress with TensorBoard
python -m tensorboard.main --logdir=runs  # http://localhost:6006/
```

The model is integrated into the backend API (`backend/main.py`) to provide real-time confidence scores for text detection across the social media feed.

### Nonescape

AI-generated image detection models by Lukas Schneider. Used under Apache-2.0 license

[GitHub Repository](https://github.com/e3ntity/nonescape)

## Local Use

### Browser Extension

The extension is located in `extension/slopmop-extension/`.

```bash
cd extension/slopmop-extension
npm install

# Development (hot reload)
npm run dev:chrome    # Chrome
npm run dev:firefox   # Firefox

# Production build
npm run build:chrome  # Output: dist_chrome/
npm run build:firefox # Output: dist_firefox/

# Tests
npm test
```

#### Loading the extension in your browser

**Chrome:**

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist_chrome/` folder

**Firefox:**

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select any file inside the `dist_firefox/` folder

### Website

The website is a Next.js app located in `website/slopmop/`.

```bash
cd website/slopmop
npm install
npm run dev       # Start development server (http://localhost:3000)
npm run build     # Build for production
npm run start     # Start production server
npm test          # Run tests
```
