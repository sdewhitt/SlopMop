/**
 * Offscreen document entry: the Battery Status API requires a Window context, so when the
 * service worker cannot use `navigator.getBattery`, the background creates this page and
 * we run the same throttle subscription + polling here.
 */
import { runBatteryThrottleLoop } from '@src/pages/background/batteryThrottleController';

void runBatteryThrottleLoop().catch((err) => {
  console.error('[SlopMop] Offscreen battery monitor failed', err);
});
