/**
 * Firestore proxy for use in content scripts / popup UI.
 *
 * All Firestore network operations run in the background script (which is
 * unrestricted by the host page's CSP). This module has the same API surface
 * as `firestore.ts` but delegates every call to the background via
 * `browser.runtime.sendMessage`.
 */

import browser from 'webextension-polyfill';
import type {
  UserSettings,
  DetectionSettings,
} from '../utils/userSettings';

interface MessageResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

/** Get existing settings or create defaults if the document doesn't exist. */
export async function getOrCreateUserSettings(uid: string): Promise<UserSettings> {
  const res = (await browser.runtime.sendMessage({
    type: 'SLOPMOP_GET_SETTINGS',
    uid,
  })) as MessageResponse;

  if (!res.success) throw new Error(res.error ?? 'Failed to load settings');
  return res.data as UserSettings;
}

/** Partially update detection settings. */
export async function updateDetectionSettings(
  uid: string,
  patch: Partial<DetectionSettings>,
): Promise<void> {
  const res = (await browser.runtime.sendMessage({
    type: 'SLOPMOP_UPDATE_DETECTION_SETTINGS',
    uid,
    patch,
  })) as MessageResponse;

  if (!res.success) throw new Error(res.error ?? 'Failed to update settings');
}

/** Reset stats back to zero. */
export async function resetStats(uid: string): Promise<void> {
  const res = (await browser.runtime.sendMessage({
    type: 'SLOPMOP_RESET_STATS',
    uid,
  })) as MessageResponse;

  if (!res.success) throw new Error(res.error ?? 'Failed to reset stats');
}

/** Reset detection settings to defaults (preserves stats). */
export async function resetSettings(uid: string): Promise<void> {
  const res = (await browser.runtime.sendMessage({
    type: 'SLOPMOP_RESET_SETTINGS',
    uid,
  })) as MessageResponse;

  if (!res.success) throw new Error(res.error ?? 'Failed to reset settings');
}
