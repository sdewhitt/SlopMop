/**
 * Firestore service for user settings CRUD operations.
 *
 * All functions operate on the `users/{uid}` document.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  type DocumentReference,
} from "firebase/firestore";
import { db, initFirebase } from "./firebase";
import {
  type UserSettings,
  type DetectionSettings,
  type DetectionStats,
  defaultUserSettings,
} from "./userSettings";

const COLLECTION = "users";

/**
 * Returns a typed document reference for the given user.
 * Throws if Firestore has not been initialized.
 */
function userDocRef(uid: string): DocumentReference {
  if (!db) throw new Error("Firestore not initialized");
  return doc(db, COLLECTION, uid);
}

// ───────────────────────────── Read ──────────────────────────────

/**
 * Fetch the full user-settings document.
 * Returns `null` if the document does not yet exist.
 */
export async function getUserSettings(
  uid: string
): Promise<UserSettings | null> {
  await initFirebase();
  const snap = await getDoc(userDocRef(uid));
  if (!snap.exists()) return null;
  return snap.data() as UserSettings;
}

// ──────────────────────────── Create ─────────────────────────────

/**
 * Create the user-settings document with sensible defaults.
 * Called once when a user signs up or first signs in.
 */
export async function createUserSettings(uid: string): Promise<UserSettings> {
  await initFirebase();
  const now = new Date().toISOString();
  const data: UserSettings = {
    ...defaultUserSettings,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(userDocRef(uid), data);
  return data;
}

/**
 * Get existing settings or create defaults if the document doesn't exist.
 * Useful for "ensure exists" flows on login.
 */
export async function getOrCreateUserSettings(
  uid: string
): Promise<UserSettings> {
  const existing = await getUserSettings(uid);
  if (existing) return existing;
  return createUserSettings(uid);
}

// ──────────────────────────── Update ─────────────────────────────

/**
 * Partially update detection settings.
 */
export async function updateDetectionSettings(
  uid: string,
  patch: Partial<DetectionSettings>
): Promise<void> {
  await initFirebase();
  const ref = userDocRef(uid);

  // Build a flat update map so Firestore merges nested fields correctly
  const updateMap: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [key, value] of Object.entries(patch)) {
    updateMap[`settings.${key}`] = value;
  }
  await updateDoc(ref, updateMap);
}

/**
 * Overwrite detection stats (e.g. syncing from extension).
 */
export async function updateDetectionStats(
  uid: string,
  stats: DetectionStats
): Promise<void> {
  await initFirebase();
  await updateDoc(userDocRef(uid), {
    stats,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Replace the entire ignored-sites list.
 */
export async function updateIgnoredSites(
  uid: string,
  sites: string[]
): Promise<void> {
  await initFirebase();
  await updateDoc(userDocRef(uid), {
    ignoredSites: sites,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Add a single site to the ignored list (no-op if already present).
 */
export async function addIgnoredSite(
  uid: string,
  site: string
): Promise<void> {
  const current = await getUserSettings(uid);
  if (!current) throw new Error("User settings not found");
  if (current.ignoredSites.includes(site)) return;
  await updateIgnoredSites(uid, [...current.ignoredSites, site]);
}

/**
 * Remove a single site from the ignored list.
 */
export async function removeIgnoredSite(
  uid: string,
  site: string
): Promise<void> {
  const current = await getUserSettings(uid);
  if (!current) throw new Error("User settings not found");
  await updateIgnoredSites(
    uid,
    current.ignoredSites.filter((s) => s !== site)
  );
}

/**
 * Reset stats back to zero.
 */
export async function resetStats(uid: string): Promise<void> {
  await updateDetectionStats(uid, {
    postsScanned: 0,
    aiDetected: 0,
    postsProcessing: 0,
  });
}

/**
 * Reset all settings to defaults (preserves stats and ignored sites).
 */
export async function resetSettings(uid: string): Promise<void> {
  await initFirebase();
  await updateDoc(userDocRef(uid), {
    settings: defaultUserSettings.settings,
    updatedAt: serverTimestamp(),
  });
}
