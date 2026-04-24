/**
 * Offscreen document entry: the Battery Status API requires a Window context, so when the
 * service worker cannot use `navigator.getBattery`, the background creates this page and
 * we read battery state here and post it back to the service worker.
 *
 * Important: offscreen documents only support the runtime API (not storage), so all state
 * writes happen in the service worker.
 */
type BatterySnapshot = { level: number; charging: boolean };

function getBatteryFn(): (() => Promise<any>) | null {
  const g = (navigator as any)?.getBattery;
  return typeof g === 'function' ? g.bind(navigator) : null;
}

async function sendSnapshot(s: BatterySnapshot): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'SLOPMOP_BATTERY_STATUS',
      payload: s,
    });
  } catch (e) {
    console.error('[SlopMop] Failed to send battery snapshot to service worker', e);
  }
}

async function start(): Promise<void> {
  const getBattery = getBatteryFn();
  if (!getBattery) {
    console.error('[SlopMop] navigator.getBattery missing in offscreen context');
    return;
  }

  const bm = await getBattery();
  const emit = () => void sendSnapshot({ level: Number(bm.level), charging: Boolean(bm.charging) });

  emit();
  bm.addEventListener('levelchange', emit);
  bm.addEventListener('chargingchange', emit);

  // Fallback poll in case events are unreliable.
  setInterval(emit, 15_000);
}

void start().catch((err) => {
  console.error('[SlopMop] Offscreen battery monitor failed', err);
});
