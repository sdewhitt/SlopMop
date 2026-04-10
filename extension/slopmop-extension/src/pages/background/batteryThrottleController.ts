import browser from 'webextension-polyfill';
import {
  getBatteryStatus,
  isBatteryApiAvailable,
  subscribeBatteryUpdates,
} from '@src/pages/background/battery';
import {
  BATTERY_THROTTLE_ACTIVE_KEY,
  computeNextBatteryThrottleState,
  type BatteryThrottleInput,
} from '@src/utils/batteryThrottle';

/** Built output path (must match Vite emit for `rollupOptions.input.offscreenBattery`). */
const OFFSCREEN_BATTERY_HTML = 'src/pages/offscreen/battery.html';

/** Events are unreliable on some macOS Chrome builds; poll as a fallback. */
const BATTERY_POLL_MS = 15_000;

/**
 * Applies battery thresholds to `batteryThrottleActive` only.
 * `settings.lowBatteryMode` is a separate, manual preference and is not overwritten here.
 * Exported so the offscreen page can poll (events are unreliable on some macOS Chrome builds).
 */
export async function syncBatteryThrottleFromStatus(status: BatteryThrottleInput): Promise<void> {
  const prev = await browser.storage.local.get(BATTERY_THROTTLE_ACTIVE_KEY);
  const wasThrottle = prev[BATTERY_THROTTLE_ACTIVE_KEY] === true;
  const nextThrottle = computeNextBatteryThrottleState(wasThrottle, status);

  if (wasThrottle !== nextThrottle) {
    await browser.storage.local.set({
      [BATTERY_THROTTLE_ACTIVE_KEY]: nextThrottle,
    });
  }
}

/**
 * Same subscription used by the service worker (when supported) and the offscreen page.
 * Keeps `batteryThrottleActive` in sync with the same thresholds as {@link computeNextBatteryThrottleState}.
 */
export async function runBatteryThrottleLoop(): Promise<void> {
  await subscribeBatteryUpdates(async (status) => {
    await syncBatteryThrottleFromStatus(status);
  });

  void getBatteryStatus().then((s) => {
    if (s) void syncBatteryThrottleFromStatus({ level: s.level, charging: s.charging });
  });
  setInterval(() => {
    void getBatteryStatus().then((s) => {
      if (s) void syncBatteryThrottleFromStatus({ level: s.level, charging: s.charging });
    });
  }, BATTERY_POLL_MS);
}

async function ensureOffscreenBatteryDocument(): Promise<void> {
  const chromeApi = typeof chrome !== 'undefined' ? chrome : undefined;
  const offscreen = chromeApi?.offscreen;
  if (!offscreen?.createDocument) {
    console.warn('[SlopMop] chrome.offscreen not available; battery throttle disabled');
    await browser.storage.local.set({ [BATTERY_THROTTLE_ACTIVE_KEY]: false });
    return;
  }

  try {
    // Always close first: if we returned early when hasDocument was true, the old offscreen
    // page could be dead after a service-worker restart while hasDocument stayed true — then
    // the battery script never ran (common cause of "rebuild but still no low-battery sync").
    if (typeof offscreen.closeDocument === 'function') {
      await offscreen.closeDocument().catch(() => {});
    }

    const runtime = chromeApi?.runtime;
    if (!runtime?.getURL) {
      await browser.storage.local.set({ [BATTERY_THROTTLE_ACTIVE_KEY]: false });
      return;
    }

    await offscreen.createDocument({
      url: runtime.getURL(OFFSCREEN_BATTERY_HTML),
      reasons: ['DOM_SCRAPING'],
      justification: 'Battery Status API requires a window context',
    });
  } catch (e) {
    console.error('[SlopMop] Failed to create offscreen battery document', e);
    await browser.storage.local.set({ [BATTERY_THROTTLE_ACTIVE_KEY]: false });
  }
}

/**
 * Listens for battery level / charging changes and sets `batteryThrottleActive` in
 * `storage.local` so content scripts treat automatic scanning as off without overwriting
 * the user's saved `settings.automaticScanning`.
 *
 * MV3 service workers usually do not expose `navigator.getBattery`; in that case we start an
 * offscreen document that runs the same listener.
 */
export async function initBatteryThrottleController(): Promise<void> {
  if (isBatteryApiAvailable()) {
    await runBatteryThrottleLoop();
    return;
  }

  console.warn(
    '[SlopMop] navigator.getBattery unavailable in this context; using offscreen battery monitor',
  );
  await ensureOffscreenBatteryDocument();
}
