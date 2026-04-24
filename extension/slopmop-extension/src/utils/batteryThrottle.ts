import type { DetectionSettings } from '@src/utils/userSettings';

/** Local-only flag: automatic scanning is forced off until battery recovers. */
export const BATTERY_THROTTLE_ACTIVE_KEY = 'batteryThrottleActive' as const;

/**
 * Local-only: user enabled "auto low battery mode" — same thresholds as throttle; does not
 * overwrite saved `lowBatteryMode` or `automaticScanning`.
 */
export const BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY = 'batteryAutoLowBatteryActive' as const;

/** Enter throttle when unplugged and charge fraction is below this (20%). */
export const LOW_BATTERY_FRACTION = 0.34;

/** Exit throttle when plugged in or charge fraction is at/above this (25% hysteresis). */
export const RESUME_BATTERY_FRACTION = 0.36;

export type BatteryThrottleInput = {
  level: number;
  charging: boolean;
};

/**
 * Hysteresis state machine: off → on when low & unplugged; on → off when charging or level recovers.
 */
export function computeNextBatteryThrottleState(
  wasActive: boolean,
  status: BatteryThrottleInput,
): boolean {
  if (!wasActive) {
    return !status.charging && status.level < LOW_BATTERY_FRACTION;
  }
  if (status.charging || status.level >= RESUME_BATTERY_FRACTION) {
    return false;
  }
  return true;
}

/** Feed + pipeline use this so user `automaticScanning` stays intact in storage. */
export function applyBatteryThrottleToSettings(
  settings: DetectionSettings,
  batteryThrottleActive: boolean | undefined,
): DetectionSettings {
  if (!batteryThrottleActive) return settings;
  return { ...settings, automaticScanning: false };
}

/** User-enabled low battery mode: same effective behavior as throttle (auto off, stored pref unchanged). */
export function applyLowBatteryModeToSettings(
  settings: DetectionSettings,
  lowBatteryMode: boolean | undefined,
): DetectionSettings {
  if (!lowBatteryMode) return settings;
  return { ...settings, automaticScanning: false };
}
