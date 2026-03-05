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
import { ExtensionMessageBus } from '@src/core/ExtensionMessageBus';
import { defaultUserSettings, type DetectionSettings } from '@src/utils/userSettings';
import { renderDebugBadge } from './debug';
import { isHostIgnored } from '@src/utils/disabledWebsites';
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

let activeObserver: FeedObserver | null = null;

function resolveDetectionSettings(stored: Record<string, unknown>): DetectionSettings {
  const saved = (stored.settings ?? {}) as Partial<DetectionSettings>;
  return { ...defaultUserSettings.settings, ...saved };
}

// Reactively stop or restart the observer when the ignored-sites list changes
// (e.g. user adds/removes the current site from the Disabled Websites list).
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !('ignoredSites' in changes)) return;

  const newSites = (changes['ignoredSites'].newValue as string[]) ?? [];
  const nowIgnored = isHostIgnored(currentHost, newSites);

  if (nowIgnored && observer) {
    observer.stop();
    observer = null;
    console.log('[SlopMop] Detection stopped for', currentHost);
  } else if (!nowIgnored && !observer) {
    // Re-init from scratch so adapters/overlays are fresh.
    initObserver();
  }

function shouldRunOnCurrentSite(
  settings: DetectionSettings,
  ignoredSites: string[],
): boolean {
  const hostname = window.location.hostname;

  if (ignoredSites.some((s) => hostname.includes(s))) return false;

  if (hostname.includes('reddit.com')) return settings.platforms.reddit;
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) return settings.platforms.twitter;
  if (hostname.includes('facebook.com')) return settings.platforms.facebook;
  if (hostname.includes('youtube.com')) return settings.platforms.youtube;
  if (hostname.includes('linkedin.com')) return settings.platforms.linkedin;

  return false;
}

function startObserver(settings: DetectionSettings): void {
  const hostname = window.location.hostname;
  let adapter;
  if (hostname.includes('reddit.com')) {
    adapter = new RedditAdapter();
  } else {
    return;
  }

  const extractor = new PostExtractor();
  const overlay = new OverlayRenderer(adapter, settings);
  const bus = new ExtensionMessageBus();
  activeObserver = new FeedObserver(adapter, extractor, overlay, bus, settings);

  bus.onDetectionResponse((res) => {
    if (!activeObserver?.markAnalyzeCompleted(res.postId)) return;
    overlay.renderResult(res.postId, res);
  });
  bus.onDetectionError(({ postId, message }) => {
    if (!activeObserver?.markAnalyzeCompleted(postId)) return;
    overlay.renderError(postId, message);
  });

  activeObserver.start();
  console.log('[SlopMop] FeedObserver started');
}

async function initFeedObserver(): Promise<void> {
  renderDebugBadge();

  const stored = await browser.storage.local.get(['settings', 'ignoredSites']);
  const settings = resolveDetectionSettings(stored);
  const ignoredSites = (stored.ignoredSites as string[] | undefined) ?? defaultUserSettings.ignoredSites;

  if (!settings.enabled) return;
  if (!shouldRunOnCurrentSite(settings, ignoredSites)) return;

  startObserver(settings);
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!changes.settings) return;

  const newSettings = resolveDetectionSettings({
    settings: changes.settings.newValue,
  });

  if (!newSettings.enabled && activeObserver) {
    activeObserver.stop();
    activeObserver = null;
    console.log('[SlopMop] FeedObserver stopped via settings change');
  }
});

initFeedObserver().catch((e) => {
  console.error('[SlopMop] observer init error', e);
});