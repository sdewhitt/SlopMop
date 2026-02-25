/**
 * Shared type definitions for user settings stored in Firestore.
 *
 * These mirror the schema used by the website at `app/lib/userSettings.ts`.
 * Keeping them in sync enables future Firestore sync from the extension.
 *
 * Firestore collection: "users"
 * Document ID: Firebase Auth UID
 */

/** Platforms the extension can monitor. */
export interface PlatformToggles {
  twitter: boolean;
  reddit: boolean;
  facebook: boolean;
  youtube: boolean;
  linkedin: boolean;
}

/** Extension detection preferences persisted to Firestore. */
export interface DetectionSettings {
  sensitivity: 'low' | 'medium' | 'high';
  highlightStyle: 'badge' | 'border' | 'dim';
  showNotifications: boolean;
  platforms: PlatformToggles;
}

/** Aggregate stats the extension reports back. */
export interface DetectionStats {
  postsScanned: number;
  aiDetected: number;
  postsProcessing: number;
}

/** Root document shape stored at `users/{uid}` in Firestore. */
export interface UserSettings {
  /** Sites (hostnames) the extension should skip entirely. */
  ignoredSites: string[];
  /** Detection preferences. */
  settings: DetectionSettings;
  /** Cumulative detection statistics. */
  stats: DetectionStats;
  /** ISO-8601 timestamp when the document was first created. */
  createdAt: string;
  /** ISO-8601 timestamp of the most recent update. */
  updatedAt: string;
}

/** Sensible defaults for a brand-new user. */
export const defaultUserSettings: Omit<UserSettings, 'createdAt' | 'updatedAt'> = {
  ignoredSites: [],
  settings: {
    sensitivity: 'medium',
    highlightStyle: 'badge',
    showNotifications: true,
    platforms: {
      twitter: true,
      reddit: true,
      facebook: true,
      youtube: true,
      linkedin: true,
    },
  },
  stats: {
    postsScanned: 0,
    aiDetected: 0,
    postsProcessing: 0,
  },
};
