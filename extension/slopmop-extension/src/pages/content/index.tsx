/**
 * Content script — injects the SlopMop panel directly into the page DOM
 * inside a Shadow DOM container. React + the Popup component are mounted
 * in the shadow root, fully isolated from the host page's styles.
 *
 * The background service worker sends a SLOPMOP_TOGGLE_PANEL message
 * whenever the extension icon is clicked.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import browser from 'webextension-polyfill';
import Popup from '@pages/popup/Popup';
import { AuthProvider } from '../../hooks/useAuth';
import { PanelProvider } from '@pages/popup/PanelContext';
import { RedditAdapter } from '@src/core/adapters/RedditAdapter';
import { PostExtractor } from '@src/core/PostExtractor';
import { FeedObserver } from '@src/core/FeedObserver';
import { OverlayRenderer } from '@src/core/OverlayRenderer';
import { DEFAULT_SETTINGS } from '@src/types/domain';
import { ExtensionMessageBus } from '@src/core/ExtensionMessageBus';
import { renderDebugBadge } from './debug';
// Inline CSS — processed by Tailwind at build time, injected into the shadow DOM
import panelCss from './panel.css?inline';

let panelRoot: HTMLElement | null = null;
let reactRoot: Root | null = null;
let visible = false;

function hidePanel() {
  if (panelRoot) {
    panelRoot.style.display = 'none';
    visible = false;
  }
}

function showPanel() {
  if (!panelRoot) {
    createPanel();
    return;
  }
  panelRoot.style.display = '';
  visible = true;
}

function createPanel() {
  // Host element
  panelRoot = document.createElement('div');
  panelRoot.id = 'slopmop-panel-root';

  // Shadow DOM isolates our styles from the host page
  const shadow = panelRoot.attachShadow({ mode: 'open' });

  // Inject Tailwind + panel styles
  const style = document.createElement('style');
  style.textContent = panelCss;
  shadow.appendChild(style);

  // React mount point
  const container = document.createElement('div');
  container.className = 'slopmop-panel';
  shadow.appendChild(container);

  document.body.appendChild(panelRoot);

  // Mount the React tree
  reactRoot = createRoot(container);
  reactRoot.render(
    <PanelProvider closePanel={hidePanel}>
      <AuthProvider>
        <Popup />
      </AuthProvider>
    </PanelProvider>,
  );
  visible = true;
}

function togglePanel() {
  if (!panelRoot) {
    createPanel();
    return;
  }
  if (visible) {
    hidePanel();
  } else {
    showPanel();
  }
}

// Listen for toggle messages from the background service worker
browser.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    (message as Record<string, unknown>).type === 'SLOPMOP_TOGGLE_PANEL'
  ) {
    togglePanel();
  }
});

try {
  console.log('[SlopMop] content script loaded');
} catch (e) {
  console.error(e);
}

// ── Feed observer ─────────────────────────────────────────────
// Scans social media feeds for AI-generated posts and renders overlays.
try {
  renderDebugBadge();

  const isReddit = window.location.hostname.includes('reddit.com');
  if (isReddit) {
    const feedSettings = { ...DEFAULT_SETTINGS };
    if (feedSettings.enabled) {
      const adapter = new RedditAdapter();
      const extractor = new PostExtractor();
      const overlay = new OverlayRenderer(adapter, feedSettings);
      const bus = new ExtensionMessageBus();
      const observer = new FeedObserver(adapter, extractor, overlay, bus, feedSettings);

      bus.onDetectionResponse((res) => {
        overlay.renderResult(res.postId, res);
      });

      observer.start();
      console.log('[SlopMop] FeedObserver started');
    }
  }
} catch (e) {
  console.error('[SlopMop] observer init error', e);
}