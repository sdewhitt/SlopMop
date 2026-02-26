/**
 * Firestore service for user settings CRUD operations.
 *
 * Mirrors the website's `app/lib/firestore.ts` so both the website and
 * extension read/write the same `users/{uid}` document.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  type DocumentReference,
} from 'firebase/firestore';
import { db, initFirebase } from './firebase';
import {
  type UserSettings,
  type DetectionSettings,
  type DetectionStats,
  defaultUserSettings,
} from '../utils/userSettings';

const COLLECTION = 'users';

/** Returns a typed document reference for the given user. */
function userDocRef(uid: string): DocumentReference {
  if (!db) throw new Error('Firestore not initialized');
  return doc(db, COLLECTION, uid);
}

// ───────────────────────────── Read ──────────────────────────────

/** Fetch the full user-settings document. Returns `null` if it does not exist. */
export async function getUserSettings(uid: string): Promise<UserSettings | null> {
  initFirebase();
  const snap = await getDoc(userDocRef(uid));
  if (!snap.exists()) return null;
  return snap.data() as UserSettings;
}

// ──────────────────────────── Create ─────────────────────────────

/** Create the user-settings document with sensible defaults. */
export async function createUserSettings(uid: string): Promise<UserSettings> {
  initFirebase();
  const now = new Date().toISOString();
  const data: UserSettings = {
    ...defaultUserSettings,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(userDocRef(uid), data);
  return data;
}

/** Get existing settings or create defaults if the document doesn't exist. */
export async function getOrCreateUserSettings(uid: string): Promise<UserSettings> {
  const existing = await getUserSettings(uid);
  if (existing) return existing;
  return createUserSettings(uid);
}

// ──────────────────────────── Update ─────────────────────────────

/** Partially update detection settings. */
export async function updateDetectionSettings(
  uid: string,
  patch: Partial<DetectionSettings>,
): Promise<void> {
  initFirebase();
  const ref = userDocRef(uid);
  const updateMap: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [key, value] of Object.entries(patch)) {
    updateMap[`settings.${key}`] = value;
  }
  await updateDoc(ref, updateMap);
}

/** Overwrite detection stats. */
export async function updateDetectionStats(
  uid: string,
  stats: DetectionStats,
): Promise<void> {
  initFirebase();
  await updateDoc(userDocRef(uid), {
    stats,
    updatedAt: serverTimestamp(),
  });
}

/** Reset stats back to zero. */
export async function resetStats(uid: string): Promise<void> {
  await updateDetectionStats(uid, {
    postsScanned: 0,
    aiDetected: 0,
    postsProcessing: 0,
  });
}

/** Reset detection settings to defaults (preserves stats). */
export async function resetSettings(uid: string): Promise<void> {
  initFirebase();
  await updateDoc(userDocRef(uid), {
    settings: defaultUserSettings.settings,
    updatedAt: serverTimestamp(),
  });
}
