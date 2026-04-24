import type { HistoryEntry } from '@src/utils/detectionHistory';

// ── Types ─────────────────────────────────────────────────────────

export type SortOption = 'newest' | 'oldest' | 'highest_confidence' | 'lowest_confidence';

export interface HistoryFilterPrefs {
  platforms: string[];   // empty = all platforms
  minConfidence: number; // 0–100
  maxConfidence: number; // 0–100
  sort: SortOption;
}

export const DEFAULT_FILTER_PREFS: HistoryFilterPrefs = {
  platforms: [],
  minConfidence: 0,
  maxConfidence: 100,
  sort: 'newest',
};

export const FILTER_PREFS_KEY = 'historyFilterPrefs';

/**
 * Returns the namespaced storage key for a specific user's filter preferences.
 * Keeps each account's UI state isolated from others.
 */
export function filterPrefsKey(uid: string): string {
  return `${FILTER_PREFS_KEY}:${uid}`;
}

export const PLATFORM_OPTIONS: { key: string; label: string; match: (p: string) => boolean }[] = [
  { key: 'reddit',    label: 'Reddit',    match: (p) => p.includes('reddit') },
  { key: 'twitter',   label: 'X',         match: (p) => p.includes('twitter') || p.includes('x.com') },
  { key: 'instagram', label: 'Instagram', match: (p) => p.includes('instagram') },
  { key: 'linkedin',  label: 'LinkedIn',  match: (p) => p.includes('linkedin') },
  { key: 'facebook',  label: 'Facebook',  match: (p) => p.includes('facebook') },
  { key: 'youtube',   label: 'YouTube',   match: (p) => p.includes('youtube') },
];

// ── Keyword search ────────────────────────────────────────────────

/**
 * Returns true if the entry matches the search query.
 * Matches against snippet, platform name, and URL — case-insensitive.
 * Returns true when query is empty.
 */
export function matchesKeyword(entry: HistoryEntry, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  const platform = PLATFORM_OPTIONS.find((o) => o.match(entry.platform))?.label ?? entry.platform;
  return (
    entry.snippet.toLowerCase().includes(q) ||
    platform.toLowerCase().includes(q) ||
    entry.url.toLowerCase().includes(q)
  );
}

/**
 * Filters entries by keyword search query, then applies platform/confidence
 * filters and sorting via the existing prefs.
 */
export function applyKeywordFilter(entries: HistoryEntry[], query: string): HistoryEntry[] {
  if (!query.trim()) return entries;
  return entries.filter((e) => matchesKeyword(e, query));
}

// ── Pure logic ────────────────────────────────────────────────────

export function applyFiltersAndSort(entries: HistoryEntry[], prefs: HistoryFilterPrefs): HistoryEntry[] {
  let filtered = entries;

  if (prefs.platforms.length > 0) {
    filtered = filtered.filter((e) =>
      prefs.platforms.some((key) => {
        const opt = PLATFORM_OPTIONS.find((o) => o.key === key);
        return opt ? opt.match(e.platform) : false;
      })
    );
  }

  filtered = filtered.filter((e) => {
    const pct = Math.round(e.confidence * 100);
    return pct >= prefs.minConfidence && pct <= prefs.maxConfidence;
  });

  filtered = [...filtered].sort((a, b) => {
    switch (prefs.sort) {
      case 'newest': return b.savedAtMs - a.savedAtMs;
      case 'oldest': return a.savedAtMs - b.savedAtMs;
      case 'highest_confidence': return b.confidence - a.confidence;
      case 'lowest_confidence': return a.confidence - b.confidence;
    }
  });

  return filtered;
}

export function isDefaultPrefs(prefs: HistoryFilterPrefs): boolean {
  return (
    prefs.platforms.length === 0 &&
    prefs.minConfidence === 0 &&
    prefs.maxConfidence === 100 &&
    prefs.sort === 'newest'
  );
}
