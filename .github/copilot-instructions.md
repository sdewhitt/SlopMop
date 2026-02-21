## Project Overview
This project is a browser extension used to automatically detect AI-generated content in social media feeds. It also has an associated website that provides users with install instructions, FAQs, user statistics, user settings, etc.

## Website
- **Framework**: Next.js with TypeScript
- **Location**: `website/slopmop/`
- **Styling**: Tailwind CSS

## Browser Extension
- **Template**: vite-web-extension (Vite-based Chrome & Firefox extension template)
- **Location**: `extension/slopmop-extension/`
- **Language**: TypeScript
- **Framework**: React 19.1.0
- **Build Tool**: Vite with platform-specific configs
  - `vite.config.chrome.ts` for Chrome builds
  - `vite.config.firefox.ts` for Firefox builds
- **Styling**: Tailwind CSS 4.x
- **Browser Support**: Chrome and Firefox
- **Manifest**: Uses CRXJS (@crxjs/vite-plugin) for manifest handling

### Extension Architecture
- **Pages**: popup, options, newtab, devtools, content script, background service worker
- **Build Commands**:
  - `npm run build:chrome` - Build for Chrome
  - `npm run build:firefox` - Build for Firefox
  - `npm run dev:chrome` - Development mode for Chrome
  - `npm run dev:firefox` - Development mode for Firefox
- **Development**: Uses nodemon for hot reload
- **TypeScript Path Aliases**: 
  - `@src/*` → `src/*`
  - `@assets/*` → `src/assets/*`
  - `@locales/*` → `src/locales/*`
  - `@pages/*` → `src/pages/*`
- **Localization**: i18n support via `src/locales/` (currently disabled, set `localize = false` in vite.config.base.ts)
- **Tooling**: ESLint with React, TypeScript, and Prettier support
- **Cross-browser Compatibility**: Uses webextension-polyfill for consistent API across browsers