## Project Overview
This project is a browser extension used to automatically detect AI-generated content in social media feeds. It also has an associated website that provides users with install instructions, FAQs, user statistics, user settings, etc.


## Website
- **Framework**: Next.js with TypeScript
- **Location**: `website/slopmop/`
- **Styling**: Tailwind CSS
- **Testing**: Jest
  - **Location**: `app/__tests__/`
  - **Config**: `jest.config.ts`
  - **Run Tests**: `npm test` (in website/slopmop/)

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
- **Testing**: Vitest
  - **Location**: `src/__tests__/`
  - **Config**: `vitest.config.ts`
  - **Setup**: `vitest.setup.ts`
  - **Run Tests**: `npm test` (in extension/slopmop-extension/)

  
## Special Instructions
- For the website, the `app/components/` directory contains reusable React components used across different pages. The main pages are located in `app/` (e.g. `app/page.tsx` for the homepage). When making changes to the UI, consider whether the change should be made in a reusable component or directly in a page.
- For the extension, the UI that users interact with is the popup page, and despite "options" exisitng and having its own .tsx, the user's settings are managed through the popup page when the user clicks on a "Settings" button to change the display.
- When making changes to either the extension or the website, make sure to adjust the tests to account for additions or changes to the UI. For the website, tests are located in `app/__tests__/` and for the extension, tests are located in `src/__tests__/`. Both use Jest/Vitest and React Testing Library for testing React components.