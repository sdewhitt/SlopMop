import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';
import {
  BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY,
  LOW_BATTERY_FRACTION,
} from '@src/utils/batteryThrottle';
import { initBatteryThrottleController } from '@src/pages/background/batteryThrottleController';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({
          settings: { lowBatteryModeAutoWhenBatteryLow: true },
          batteryAutoLowBatteryActive: false,
        }),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn(),
      },
    },
  },
}));

vi.mock('@src/pages/background/battery', () => ({
  isBatteryApiAvailable: () => false,
  subscribeBatteryUpdates: vi.fn(),
  getBatteryStatus: vi.fn().mockResolvedValue({
    level: LOW_BATTERY_FRACTION - 0.01,
    levelPercent: 1,
    charging: false,
    chargingTime: Infinity,
    dischargingTime: Infinity,
  }),
}));

describe('battery auto low-battery override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Provide chrome.offscreen so initBatteryThrottleController doesn't force-disable flags.
    vi.stubGlobal('chrome', {
      offscreen: {
        createDocument: vi.fn().mockResolvedValue(undefined),
        closeDocument: vi.fn().mockResolvedValue(undefined),
      },
      runtime: {
        getURL: vi.fn((p: string) => `chrome-extension://mock/${p}`),
      },
    });
  });

  it('immediately syncs auto-low-battery when user enables the setting', async () => {
    await initBatteryThrottleController();

    const addListener = vi.mocked(browser.storage.onChanged.addListener);
    expect(addListener).toHaveBeenCalledTimes(1);
    const handler = addListener.mock.calls[0][0] as any;

    // Simulate settings toggle enabled.
    await handler(
      {
        settings: {
          newValue: { lowBatteryModeAutoWhenBatteryLow: true },
        },
      },
      'local',
    );
    // Listener schedules async sync via Promise chain; allow microtasks to flush.
    await Promise.resolve();
    await Promise.resolve();

    // It should compute and write BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY = true (low & unplugged).
    const setMock = vi.mocked(browser.storage.local.set);
    expect(
      setMock.mock.calls.some(
        (call) => call[0] && (call[0] as any)[BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY] === true,
      ),
    ).toBe(true);
  });
});

