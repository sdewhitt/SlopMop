/**
 * Content script — injects the SlopMop panel directly into the page DOM
 * inside a Shadow DOM container. React + the Popup component are mounted
 * in the shadow root, fully isolated from the host page's styles.
 *
 * The background can send SLOPMOP_TOGGLE_PANEL to toggle the in-page panel (e.g. from messages).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import browser from 'webextension-polyfill';
import Popup from '@pages/popup/Popup';
import { AuthProvider } from '../../hooks/useAuth';
import { PanelProvider } from '@pages/popup/PanelContext';
import { ThemeProvider } from '../../hooks/useTheme';
import { RedditAdapter } from '@src/core/adapters/RedditAdapter';
import { InstagramAdapter } from '@src/core/adapters/InstagramAdapter';
import { LinkedInAdapter } from '@src/core/adapters/LinkedInAdapter';
import { XAdapter } from '@src/core/adapters/XAdapter';
import { PostExtractor } from '@src/core/PostExtractor';
import { FeedObserver } from '@src/core/FeedObserver';
import { OverlayRenderer } from '@src/core/OverlayRenderer';
import { InstagramOverlayRenderer } from '@src/core/InstagramOverlayRenderer';
import { LinkedInOverlayRenderer } from '@src/core/LinkedInOverlayRenderer';
import { XOverlayRenderer } from '@src/core/XOverlayRenderer';
import { ExtensionMessageBus } from '@src/core/ExtensionMessageBus';
import {
  defaultUserSettings,
  mergeDetectionSettingsFromStored,
  type DetectionSettings,
} from '@src/utils/userSettings';
import {
  applyBatteryThrottleToSettings,
  applyLowBatteryModeToSettings,
  BATTERY_THROTTLE_ACTIVE_KEY,
  BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY,
} from '@src/utils/batteryThrottle';
import { renderDebugBadge } from './debug';
import { isHostIgnored } from '@src/utils/disabledWebsites';
// Inline CSS — processed by Tailwind at build time, injected into the shadow DOM
import panelCss from './panel.css?inline';

let panelRoot: HTMLElement | null = null;
let reactRoot: Root | null = null;
let visible = false;
let shadowContainer: HTMLElement | null = null;

function resolveThemeMode(
  pref: string | undefined,
  legacy: string | undefined,
): 'dark' | 'light' {
  if (pref === 'dark') return 'dark';
  if (pref === 'light') return 'light';
  if (pref === 'system' || (!pref && !legacy)) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (legacy === 'dark') return 'dark';
  return 'light';
}

function applyThemeToPanel(mode: 'dark' | 'light'): void {
  if (!shadowContainer) return;
  if (mode === 'dark') {
    shadowContainer.classList.add('dark');
  } else {
    shadowContainer.classList.remove('dark');
  }
}

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

  shadowContainer = container;

  document.body.appendChild(panelRoot);

  // Apply initial theme
  void browser.storage.local.get(['themePreference', 'theme']).then((result) => {
    applyThemeToPanel(resolveThemeMode(
      result.themePreference as string | undefined,
      result.theme as string | undefined,
    ));
  });

  // Prevent scroll events from reaching the host page
  shadow.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
  shadow.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });

  // Mount the React tree
  reactRoot = createRoot(container);
  reactRoot.render(
    <ThemeProvider>
      <PanelProvider closePanel={hidePanel}>
        <AuthProvider>
          <Popup />
        </AuthProvider>
      </PanelProvider>
    </ThemeProvider>,
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

// Listen for messages from the background service worker
browser.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message !== 'object' || message === null) return;
  const msg = message as Record<string, unknown>;
  if (msg.type === 'SLOPMOP_TOGGLE_PANEL') {
    togglePanel();
    return;
  }
  if (msg.type === 'SLOPMOP_SCAN_ENTIRE_PAGE') {
    activeObserver?.scanEntirePage();
    return;
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

function getCurrentHost(): string {
  return window.location.hostname.toLowerCase().replace(/^www\./, '');
}

function resolveDetectionSettings(stored: Record<string, unknown>): DetectionSettings {
  const base = mergeDetectionSettingsFromStored(stored.settings);
  const throttleOn = stored[BATTERY_THROTTLE_ACTIVE_KEY] === true;
  const autoLowBatteryOn = stored[BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY] === true;
  const withLowBattery = applyLowBatteryModeToSettings(base, base.lowBatteryMode || autoLowBatteryOn);
  return applyBatteryThrottleToSettings(withLowBattery, throttleOn);
}

function shouldRunOnCurrentSite(
  settings: DetectionSettings,
  ignoredSites: string[],
): boolean {
  const hostname = getCurrentHost();

  if (isHostIgnored(hostname, ignoredSites)) return false;

  if (hostname.includes('reddit.com')) return settings.platforms.reddit;
  if (hostname.includes('instagram.com')) return settings.platforms.instagram;
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) return settings.platforms.twitter;
  if (hostname.includes('facebook.com')) return settings.platforms.facebook;
  if (hostname.includes('youtube.com')) return settings.platforms.youtube;
  if (hostname.includes('linkedin.com')) return settings.platforms.linkedin;

  return false;
}

function startObserver(settings: DetectionSettings): void {
  const hostname = getCurrentHost();
  let adapter;
  let overlay;
  if (hostname.includes('reddit.com')) {
    adapter = new RedditAdapter();
    overlay = new OverlayRenderer(settings);
  } else if (hostname.includes('instagram.com')) {
    adapter = new InstagramAdapter();
    overlay = new InstagramOverlayRenderer(adapter, settings);
  } else if (hostname.includes('linkedin.com')) {
    adapter = new LinkedInAdapter();
    overlay = new LinkedInOverlayRenderer(adapter, settings);
  } else if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    adapter = new XAdapter();
    overlay = new XOverlayRenderer(adapter, settings);
  } else {
    return;
  }

  const extractor = new PostExtractor();
  const bus = new ExtensionMessageBus();
  activeObserver = new FeedObserver(adapter, extractor, overlay, bus, settings);

  bus.onDetectionResponse((res) => {
    if (!activeObserver?.markAnalyzeCompleted(res.postId, 'result')) return;
    overlay.renderResult(res.postId, res);
  });
  bus.onDetectionError(({ postId, message }) => {
    if (!activeObserver?.markAnalyzeCompleted(postId, 'error')) return;
    overlay.renderError(postId, message, () => {
      activeObserver?.retryAnalyze(postId);
    });
  });
  bus.onDetectionLanguageUnsupported((payload) => {
    console.log(
      '[SlopMop] Language detection (franc):',
      payload.detectedCode,
      '(' + payload.detectedLanguageName + '),',
      'confidence:',
      Math.round(payload.confidence * 100) + '%',
      '— skipping POST /detect',
    );
    if (!activeObserver?.markAnalyzeCompleted(payload.postId)) return;
    overlay.renderLanguageUnsupported(payload.postId, {
      simpleTitle: payload.hoverSimple,
      tooltipTitle: payload.hoverTooltipTitle,
      tooltipBody: payload.hoverTooltipBody,
    });
  });

  bus.onFactCheckResult(({ postId, items }) => {
    overlay.renderFactCheckResult(postId, items);
  });
  bus.onFactCheckError(({ postId, message }) => {
    overlay.renderFactCheckError(postId, message);
  });

  activeObserver.start();
  console.log('[SlopMop] FeedObserver started');
}

async function initFeedObserver(): Promise<void> {
  // renderDebugBadge();

  const stored = await browser.storage.local.get([
    'settings',
    'ignoredSites',
    BATTERY_THROTTLE_ACTIVE_KEY,
    BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY,
  ]);
  const settings = resolveDetectionSettings(stored);
  const ignoredSites = (stored.ignoredSites as string[] | undefined) ?? defaultUserSettings.ignoredSites;

  if (!settings.enabled) return;
  if (!shouldRunOnCurrentSite(settings, ignoredSites)) return;

  startObserver(settings);
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.themePreference || changes.theme) {
    const pref = (changes.themePreference?.newValue ?? changes.theme?.newValue) as string | undefined;
    applyThemeToPanel(resolveThemeMode(pref, undefined));
  }

  if (
    !changes.settings &&
    !changes.ignoredSites &&
    changes.batteryThrottleActive === undefined &&
    changes.batteryAutoLowBatteryActive === undefined
  ) {
    return;
  }

  void browser.storage.local
    .get([
      'settings',
      'ignoredSites',
      BATTERY_THROTTLE_ACTIVE_KEY,
      BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY,
    ])
    .then((stored) => {
      const currentHost = getCurrentHost();
      const newSettings = resolveDetectionSettings(stored);
      const newIgnoredSites =
        (stored.ignoredSites as string[] | undefined) ?? defaultUserSettings.ignoredSites;
      const shouldRun = shouldRunOnCurrentSite(newSettings, newIgnoredSites);

      if (!newSettings.enabled && activeObserver) {
        activeObserver.stop();
        activeObserver = null;
        console.log('[SlopMop] FeedObserver stopped (extension disabled)');
        return;
      }

      if (!shouldRun && activeObserver) {
        activeObserver.stop();
        activeObserver = null;
        console.log('[SlopMop] FeedObserver stopped for', currentHost);
        return;
      }

      if (shouldRun && newSettings.enabled && activeObserver) {
        activeObserver.updateSettings(newSettings);
        return;
      }

      if (shouldRun && newSettings.enabled && !activeObserver) {
        initFeedObserver().catch((e) => {
          console.error('[SlopMop] observer re-init error', e);
        });
      }
    });
});

initFeedObserver().catch((e) => {
  console.error('[SlopMop] observer init error', e);
});

// When the user navigates within an SPA (e.g. clicks a post on LinkedIn), the URL changes
// but the page does not reload. seenPostIds still has the post from the feed, so we skip it.
// Rescan with a cleared cache so the post gets a badge.
// Patch History.prototype so frameworks that hold a reference to the native pushState/replaceState
// still trigger a rescan (important for x.com client-side routing).
function setupNavigationListener(): void {
  let lastUrl = location.href;
  const checkUrl = (): void => {
    const current = location.href;
    if (current !== lastUrl) {
      lastUrl = current;
      activeObserver?.rescanForNewPage?.();
      const h = location.hostname.toLowerCase().replace(/^www\./, '');
      if (h.includes('x.com') || h.includes('twitter.com')) {
        activeObserver?.schedulePostNavigationScans?.();
      }
    }
  };
  window.addEventListener('popstate', checkUrl);
  window.addEventListener('hashchange', checkUrl);
  const origPush = History.prototype.pushState;
  const origReplace = History.prototype.replaceState;
  History.prototype.pushState = function (
    this: History,
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    origPush.call(this, data, unused, url ?? undefined);
    checkUrl();
  };
  History.prototype.replaceState = function (
    this: History,
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    origReplace.call(this, data, unused, url ?? undefined);
    checkUrl();
  };
}
setupNavigationListener();