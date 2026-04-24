import browser from 'webextension-polyfill';
import {
  getBatteryStatus,
  isBatteryApiAvailable,
  subscribeBatteryUpdates,
} from '@src/pages/background/battery';
import {
  BATTERY_THROTTLE_ACTIVE_KEY,
  BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY,
  computeNextBatteryThrottleState,
  type BatteryThrottleInput,
} from '@src/utils/batteryThrottle';
import { mergeDetectionSettingsFromStored } from '@src/utils/userSettings';

/** Built output path (must match Vite emit for `rollupOptions.input.offscreenBattery`). */
const OFFSCREEN_BATTERY_HTML = 'src/pages/offscreen/battery.html';

/** Events are unreliable on some macOS Chrome builds; poll as a fallback. */
const BATTERY_POLL_MS = 15_000;

let batterySettingsListenerRegistered = false;
let batteryControllerInitialized = false;

const BATTERY_DEBUG_SNAPSHOT_KEY = 'slopmopLastBatterySnapshot' as const;

type BatteryDebugSnapshot = {
  /** unix ms */
  at: number;
  /** 0..1 */
  level: number;
  charging: boolean;
  source: 'event' | 'poll' | 'init-probe';
};

async function writeBatteryDebugSnapshot(
  status: BatteryThrottleInput,
  source: BatteryDebugSnapshot['source'],
): Promise<void> {
  await browser.storage.local.set({
    [BATTERY_DEBUG_SNAPSHOT_KEY]: {
      at: Date.now(),
      level: status.level,
      charging: status.charging,
      source,
    } satisfies BatteryDebugSnapshot,
  });
}

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
 * Same hysteresis as {@link computeNextBatteryThrottleState}, gated by
 * `settings.lowBatteryModeAutoWhenBatteryLow`. Does not write `settings`.
 */
export async function syncBatteryAutoLowBatteryFromStatus(status: BatteryThrottleInput): Promise<void> {
  const prev = await browser.storage.local.get([BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY, 'settings']);
  const base = mergeDetectionSettingsFromStored(prev.settings);
  const enabled = base.lowBatteryModeAutoWhenBatteryLow === true;
  const wasActive = prev[BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY] === true;
  const nextActive = enabled ? computeNextBatteryThrottleState(wasActive, status) : false;

  if (wasActive !== nextActive) {
    await browser.storage.local.set({
      [BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY]: nextActive,
    });
  }
}

async function syncBatteryFromStatus(status: BatteryThrottleInput): Promise<void> {
  await syncBatteryThrottleFromStatus(status);
  await syncBatteryAutoLowBatteryFromStatus(status);
}

/**
 * Same subscription used by the service worker (when supported) and the offscreen page.
 * Keeps `batteryThrottleActive` in sync with the same thresholds as {@link computeNextBatteryThrottleState}.
 */
export async function runBatteryThrottleLoop(): Promise<void> {
  await subscribeBatteryUpdates(async (status) => {
    await writeBatteryDebugSnapshot({ level: status.level, charging: status.charging }, 'event');
    await syncBatteryFromStatus(status);
  });

  void getBatteryStatus().then((s) => {
    if (!s) return;
    void writeBatteryDebugSnapshot({ level: s.level, charging: s.charging }, 'poll');
    void syncBatteryFromStatus({ level: s.level, charging: s.charging });
  });
  setInterval(() => {
    void getBatteryStatus().then((s) => {
      if (!s) return;
      void writeBatteryDebugSnapshot({ level: s.level, charging: s.charging }, 'poll');
      void syncBatteryFromStatus({ level: s.level, charging: s.charging });
    });
  }, BATTERY_POLL_MS);
}

async function ensureOffscreenBatteryDocument(): Promise<void> {
  const chromeApi = typeof chrome !== 'undefined' ? chrome : undefined;
  const offscreen = chromeApi?.offscreen;
  if (!offscreen?.createDocument) {
    console.warn('[SlopMop] chrome.offscreen not available; battery throttle disabled');
    await browser.storage.local.set({
      [BATTERY_THROTTLE_ACTIVE_KEY]: false,
      [BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY]: false,
    });
    return;
  }

  try {
    // Prefer "only create when missing" to avoid "single offscreen document" errors.
    // If the document exists but is dead, we can force-recreate based on a stale heartbeat.
    const hasDocument =
      typeof offscreen.hasDocument === 'function' ? await offscreen.hasDocument().catch(() => false) : false;

    const heartbeat = await browser.storage.local.get('slopmopOffscreenBatteryLastPingAt');
    const lastPingAt = heartbeat.slopmopOffscreenBatteryLastPingAt as number | undefined;
    const isAlive = typeof lastPingAt === 'number' && Date.now() - lastPingAt < 30_000;

    if (hasDocument && isAlive) return;

    if (hasDocument && typeof offscreen.closeDocument === 'function') {
      await offscreen.closeDocument().catch(() => {});
    }

    const runtime = chromeApi?.runtime;
    if (!runtime?.getURL) {
      await browser.storage.local.set({
        [BATTERY_THROTTLE_ACTIVE_KEY]: false,
        [BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY]: false,
      });
      return;
    }

    await offscreen.createDocument({
      url: runtime.getURL(OFFSCREEN_BATTERY_HTML),
      // Chrome expects BATTERY_STATUS for navigator.getBattery (not DOM_SCRAPING).
      reasons: ['BATTERY_STATUS'],
      justification: 'Battery Status API requires a window context',
    });
  } catch (e) {
    // If another init raced us, createDocument can throw "Only a single offscreen document..."
    // Treat that as success; the existing document should run the monitor loop.
    const msg = e instanceof Error ? e.message : String(e);
    if (/single offscreen document/i.test(msg)) return;

    console.error('[SlopMop] Failed to create offscreen battery document', e);
    await browser.storage.local.set({
      [BATTERY_THROTTLE_ACTIVE_KEY]: false,
      [BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY]: false,
    });
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
  if (batteryControllerInitialized) return;

  if (!batterySettingsListenerRegistered) {
    batterySettingsListenerRegistered = true;
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.settings) return;
      const raw = changes.settings.newValue;
      if (!raw || typeof raw !== 'object') return;
      const merged = mergeDetectionSettingsFromStored(raw);
      if (!merged.lowBatteryModeAutoWhenBatteryLow) {
        void browser.storage.local.set({ [BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY]: false });
        return;
      }

      // If the user just enabled auto-low-battery while already below threshold,
      // force a sync immediately (don’t wait for the next battery event/poll).
      void getBatteryStatus().then((s) => {
        if (!s) return;
        void syncBatteryAutoLowBatteryFromStatus({ level: s.level, charging: s.charging });
      });
    });
  }

  try {
    // Some contexts expose getBattery but it always rejects; probe a real read before committing.
    const swCanReadBattery =
      isBatteryApiAvailable() && (await getBatteryStatus()) !== null;

    if (swCanReadBattery) {
      const s = await getBatteryStatus();
      if (s) await writeBatteryDebugSnapshot({ level: s.level, charging: s.charging }, 'init-probe');
      await runBatteryThrottleLoop();
      batteryControllerInitialized = true;
      return;
    }

    console.warn(
      '[SlopMop] navigator.getBattery unavailable or unreadable in this context; using offscreen battery monitor',
    );
    await ensureOffscreenBatteryDocument();
    batteryControllerInitialized = true;
  } catch (e) {
    console.error('[SlopMop] initBatteryThrottleController failed', e);
    throw e;
  }
}
