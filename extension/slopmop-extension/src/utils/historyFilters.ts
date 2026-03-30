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

export const PLATFORM_OPTIONS: { key: string; label: string; match: (p: string) => boolean }[] = [
  { key: 'reddit',    label: 'Reddit',    match: (p) => p.includes('reddit') },
  { key: 'twitter',   label: 'X',         match: (p) => p.includes('twitter') || p.includes('x.com') },
  { key: 'instagram', label: 'Instagram', match: (p) => p.includes('instagram') },
  { key: 'linkedin',  label: 'LinkedIn',  match: (p) => p.includes('linkedin') },
  { key: 'facebook',  label: 'Facebook',  match: (p) => p.includes('facebook') },
  { key: 'youtube',   label: 'YouTube',   match: (p) => p.includes('youtube') },
];

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
