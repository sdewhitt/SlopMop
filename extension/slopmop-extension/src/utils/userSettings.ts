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
  linkedin: boolean;
  instagram: boolean;
  google: boolean;
}

const PLATFORM_KEYS: Array<keyof PlatformToggles> = [
  'twitter',
  'reddit',
  'facebook',
  'linkedin',
  'instagram',
  'google',
];

/** Languages the user allows for **text** AI detection (subset of model-capable langs). */
export type DetectionLanguageCode = 'eng' | 'spa' | 'fra';

const ALL_DETECTION_LANGS: DetectionLanguageCode[] = ['eng', 'spa', 'fra'];

/** Coerce stored value; use default triple when missing/invalid. Preserves `[]` when user disabled all. */
export function normalizeDetectionLanguages(raw: unknown): DetectionLanguageCode[] {
  if (raw === undefined) return [...ALL_DETECTION_LANGS];
  if (!Array.isArray(raw)) return [...ALL_DETECTION_LANGS];
  const allowed = new Set<DetectionLanguageCode>(ALL_DETECTION_LANGS);
  return raw.filter((x): x is DetectionLanguageCode => allowed.has(x as DetectionLanguageCode));
}

/** Extension detection preferences persisted to Firestore. */
export interface DetectionSettings {
  sensitivity: 'low' | 'medium' | 'high';
  highlightStyle: 'badge' | 'border' | 'dim';
  showNotifications: boolean;
  automaticScanning: boolean;
  platforms: PlatformToggles;
  enabled: boolean;
  scanText: boolean;
  scanImages: boolean;
  scanComments: 'off' | 'user_triggered' | 'auto_top_n';
  uiMode: 'simple' | 'detailed';
  badgeSize: 'small' | 'medium' | 'large';
  badgePosition: 'top_right' | 'top_left' | 'bottom_right';
  detectionTheme: 'default' | 'high_contrast' | 'minimal';
  accessibilityMode: boolean;
  highlightSegments: boolean;
  /** Show Fact check next to Detect Now on posts (manual / eligible feeds). */
  factCheck: boolean;
  /**
   * When on, detection hover tooltips include server-reported Detect / Fact-check milliseconds
   * (when available). Off keeps the default tooltip (model line + client round-trip ms).
   */
  powerUserTiming: boolean;
  /**
   * Manual power-saving: when on, automatic scanning is forced off and the Automatic Scanning
   * toggle is disabled until you turn this off. The extension does not overwrite this when it
   * automatically pauses scanning for low battery while unplugged.
   */
  lowBatteryMode: boolean;
  /**
   * When on, low-battery mode behavior applies automatically while unplugged and below the low
   * battery threshold; clears when charging or above the resume threshold. Saved scanning prefs
   * are not overwritten (same pattern as automatic low-battery pause).
   */
  lowBatteryModeAutoWhenBatteryLow: boolean;
  /**
   * Text detection runs only when franc's top guess is among these (plus Scots when English is on).
   * Default all three. Empty disables all text detection.
   */
  detectionLanguages: DetectionLanguageCode[];
  /** Cache recent detection results for up to 24 hours to avoid redundant /detect calls. */
  cacheRecentResults: boolean;
}

/** Aggregate stats the extension reports back. */
export interface DetectionStats {
  postsScanned: number;
  aiDetected: number;
  postsProcessing: number;
  /** Detection count keyed by platform hostname, e.g. { "reddit.com": 12 }. */
  platformCounts: Record<string, number>;
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
    automaticScanning: false,
    platforms: {
      twitter: true,
      reddit: true,
      facebook: true,
      linkedin: true,
      instagram: true,
      google: true,
    },
    enabled: true,
    scanText: true,
    scanImages: true,
    scanComments: 'auto_top_n',
    uiMode: 'simple',
    badgeSize: 'medium',
    badgePosition: 'top_right',
    detectionTheme: 'default',
    accessibilityMode: false,
    highlightSegments: true,
    factCheck: true,
    powerUserTiming: false,
    lowBatteryMode: false,
    lowBatteryModeAutoWhenBatteryLow: false,
    detectionLanguages: ['eng', 'spa', 'fra'],
    cacheRecentResults: true,
  },
  stats: {
    postsScanned: 0,
    aiDetected: 0,
    postsProcessing: 0,
    platformCounts: {},
  },
};

function normalizePlatformToggles(raw: unknown): PlatformToggles {
  const next: PlatformToggles = { ...defaultUserSettings.settings.platforms };
  if (!raw || typeof raw !== 'object') return next;
  const source = raw as Record<string, unknown>;
  for (const key of PLATFORM_KEYS) {
    const value = source[key];
    if (typeof value === 'boolean') next[key] = value;
  }
  return next;
}

/** Merge partial stored settings with defaults (used by background, content, battery sync). */
export function mergeDetectionSettingsFromStored(raw: unknown): DetectionSettings {
  const saved = (raw ?? {}) as Partial<DetectionSettings>;
  return {
    ...defaultUserSettings.settings,
    ...saved,
    platforms: normalizePlatformToggles(saved.platforms),
    detectionLanguages: normalizeDetectionLanguages(saved.detectionLanguages),
  };
}
