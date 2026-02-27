# SlopMop
Realtime social media AI-detection browser extension

## Getting Started

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
