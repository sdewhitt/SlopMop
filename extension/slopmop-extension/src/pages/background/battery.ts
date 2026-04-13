/**
 * Battery Status API helpers — level (0–100%) and charging state.
 * May be unavailable in some contexts (e.g. service workers without getBattery).
 */

/** Narrow BatteryManager shape (project Navigator typings may omit getBattery). */
type BatteryManagerLike = {
  readonly charging: boolean;
  readonly chargingTime: number;
  readonly dischargingTime: number;
  readonly level: number;
  addEventListener(
    type: 'levelchange' | 'chargingchange' | 'chargingtimechange' | 'dischargingtimechange',
    listener: () => void,
  ): void;
  removeEventListener(
    type: 'levelchange' | 'chargingchange' | 'chargingtimechange' | 'dischargingtimechange',
    listener: () => void,
  ): void;
};

type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryManagerLike> };

export type BatteryStatus = {
  /** Charge fraction 0–1 (from BatteryManager.level). */
  level: number;
  /** Same level as an integer percent 0–100. */
  levelPercent: number;
  /** Whether the device is plugged in / charging. */
  charging: boolean;
  /** Seconds until full, or Infinity if unknown / not charging. */
  chargingTime: number;
  /** Seconds until empty, or Infinity if unknown / charging. */
  dischargingTime: number;
};

function getBatteryFn(): (() => Promise<BatteryManagerLike>) | null {
  if (typeof navigator === 'undefined') return null;
  const g = (navigator as NavigatorWithBattery).getBattery;
  return typeof g === 'function' ? g.bind(navigator) : null;
}

function snapshotFromManager(bm: BatteryManagerLike): BatteryStatus {
  return {
    level: bm.level,
    levelPercent: Math.round(bm.level * 100),
    charging: bm.charging,
    chargingTime: bm.chargingTime,
    dischargingTime: bm.dischargingTime,
  };
}

/** True if `getBattery()` can be used in this JS context. */
export function isBatteryApiAvailable(): boolean {
  return getBatteryFn() !== null;
}

/** One-shot read of battery level and charging state. */
export async function getBatteryStatus(): Promise<BatteryStatus | null> {
  const getBattery = getBatteryFn();
  if (!getBattery) return null;
  try {
    const bm = await getBattery();
    return snapshotFromManager(bm);
  } catch {
    return null;
  }
}

/**
 * Subscribe to live updates (level and charging changes).
 * Invokes the callback immediately with the current snapshot, then on each event.
 * Returns an unsubscribe function. If the API is missing, returns a no-op unsubscribe.
 */
export async function subscribeBatteryUpdates(
  callback: (status: BatteryStatus) => void,
): Promise<() => void> {
  const getBattery = getBatteryFn();
  if (!getBattery) {
    return () => {};
  }

  let bm: BatteryManagerLike;
  try {
    bm = await getBattery();
  } catch {
    return () => {};
  }

  const notify = () => {
    callback(snapshotFromManager(bm));
  };

  notify();
  bm.addEventListener('levelchange', notify);
  bm.addEventListener('chargingchange', notify);
  bm.addEventListener('chargingtimechange', notify);
  bm.addEventListener('dischargingtimechange', notify);

  return () => {
    bm.removeEventListener('levelchange', notify);
    bm.removeEventListener('chargingchange', notify);
    bm.removeEventListener('chargingtimechange', notify);
    bm.removeEventListener('dischargingtimechange', notify);
  };
}
