import { describe, expect, it } from 'vitest';
import {
  applyFiltersAndSort,
  isDefaultPrefs,
  DEFAULT_FILTER_PREFS,
  type HistoryFilterPrefs,
} from '@src/utils/historyFilters';
import type { HistoryEntry } from '@src/utils/detectionHistory';

// ── Helpers ───────────────────────────────────────────────────────

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    postId: 'post-1',
    url: 'https://reddit.com/r/test/comments/abc/title',
    platform: 'reddit.com',
    snippet: 'Some text',
    confidence: 0.75,
    verdict: 'likely_ai',
    savedAtMs: 1000,
    pinned: false,
    ...overrides,
  };
}

// ── isDefaultPrefs ────────────────────────────────────────────────

describe('isDefaultPrefs', () => {
  it('returns true for default prefs', () => {
    expect(isDefaultPrefs(DEFAULT_FILTER_PREFS)).toBe(true);
  });

  it('returns false when a platform is selected', () => {
    expect(isDefaultPrefs({ ...DEFAULT_FILTER_PREFS, platforms: ['reddit'] })).toBe(false);
  });

  it('returns false when minConfidence is non-zero', () => {
    expect(isDefaultPrefs({ ...DEFAULT_FILTER_PREFS, minConfidence: 10 })).toBe(false);
  });

  it('returns false when maxConfidence is not 100', () => {
    expect(isDefaultPrefs({ ...DEFAULT_FILTER_PREFS, maxConfidence: 80 })).toBe(false);
  });

  it('returns false when sort is not newest', () => {
    expect(isDefaultPrefs({ ...DEFAULT_FILTER_PREFS, sort: 'oldest' })).toBe(false);
  });
});

// ── Platform filtering ────────────────────────────────────────────

describe('applyFiltersAndSort — platform filter', () => {
  const entries = [
    makeEntry({ postId: 'r', platform: 'reddit.com' }),
    makeEntry({ postId: 'i', platform: 'instagram.com' }),
    makeEntry({ postId: 'l', platform: 'linkedin.com' }),
    makeEntry({ postId: 't', platform: 'twitter.com' }),
    makeEntry({ postId: 'x', platform: 'x.com' }),
    makeEntry({ postId: 'f', platform: 'facebook.com' }),
    makeEntry({ postId: 'y', platform: 'youtube.com' }),
  ];

  it('returns all entries when platforms is empty', () => {
    const result = applyFiltersAndSort(entries, DEFAULT_FILTER_PREFS);
    expect(result).toHaveLength(entries.length);
  });

  it('filters to reddit only', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, platforms: ['reddit'] };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('r');
  });

  it('filters to instagram only', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, platforms: ['instagram'] };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('i');
  });

  it('matches twitter.com under twitter key', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, platforms: ['twitter'] };
    const result = applyFiltersAndSort(entries, prefs);
    const ids = result.map((e) => e.postId);
    expect(ids).toContain('t');
  });

  it('matches x.com under twitter key', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, platforms: ['twitter'] };
    const result = applyFiltersAndSort(entries, prefs);
    const ids = result.map((e) => e.postId);
    expect(ids).toContain('x');
  });

  it('filters to multiple platforms', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, platforms: ['reddit', 'linkedin'] };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result).toHaveLength(2);
    const ids = result.map((e) => e.postId);
    expect(ids).toContain('r');
    expect(ids).toContain('l');
  });

  it('returns empty when no entries match selected platform', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, platforms: ['youtube'] };
    const redditOnly = entries.filter((e) => e.platform === 'reddit.com');
    const result = applyFiltersAndSort(redditOnly, prefs);
    expect(result).toHaveLength(0);
  });
});

// ── Confidence filtering ──────────────────────────────────────────

describe('applyFiltersAndSort — confidence filter', () => {
  const entries = [
    makeEntry({ postId: 'low',  confidence: 0.10 }),
    makeEntry({ postId: 'mid',  confidence: 0.50 }),
    makeEntry({ postId: 'high', confidence: 0.90 }),
  ];

  it('returns all entries with default 0–100 range', () => {
    expect(applyFiltersAndSort(entries, DEFAULT_FILTER_PREFS)).toHaveLength(3);
  });

  it('filters to high confidence only (>= 80)', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, minConfidence: 80 };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('high');
  });

  it('filters to low confidence only (<= 20)', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, maxConfidence: 20 };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('low');
  });

  it('filters within a mid range 40–60', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, minConfidence: 40, maxConfidence: 60 };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('mid');
  });

  it('includes boundary values exactly', () => {
    // confidence 0.10 → 10%, 0.90 → 90%
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, minConfidence: 10, maxConfidence: 90 };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result).toHaveLength(3);
  });

  it('returns empty when range excludes all entries', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, minConfidence: 95, maxConfidence: 100 };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result).toHaveLength(0);
  });
});

// ── Sorting ───────────────────────────────────────────────────────

describe('applyFiltersAndSort — sorting', () => {
  const entries = [
    makeEntry({ postId: 'oldest',  savedAtMs: 1000, confidence: 0.30 }),
    makeEntry({ postId: 'middle',  savedAtMs: 2000, confidence: 0.60 }),
    makeEntry({ postId: 'newest',  savedAtMs: 3000, confidence: 0.90 }),
  ];

  it('sorts newest first by default', () => {
    const result = applyFiltersAndSort(entries, DEFAULT_FILTER_PREFS);
    expect(result.map((e) => e.postId)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('sorts oldest first', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, sort: 'oldest' };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result.map((e) => e.postId)).toEqual(['oldest', 'middle', 'newest']);
  });

  it('sorts by highest confidence first', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, sort: 'highest_confidence' };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result.map((e) => e.postId)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('sorts by lowest confidence first', () => {
    const prefs: HistoryFilterPrefs = { ...DEFAULT_FILTER_PREFS, sort: 'lowest_confidence' };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result.map((e) => e.postId)).toEqual(['oldest', 'middle', 'newest']);
  });

  it('does not mutate the input array', () => {
    const input = [...entries];
    applyFiltersAndSort(entries, { ...DEFAULT_FILTER_PREFS, sort: 'oldest' });
    expect(entries).toEqual(input);
  });
});

// ── Combined filters + sort ───────────────────────────────────────

describe('applyFiltersAndSort — combined filters and sort', () => {
  const entries = [
    makeEntry({ postId: 'r-low',  platform: 'reddit.com',    confidence: 0.20, savedAtMs: 1000 }),
    makeEntry({ postId: 'r-high', platform: 'reddit.com',    confidence: 0.80, savedAtMs: 2000 }),
    makeEntry({ postId: 'i-mid',  platform: 'instagram.com', confidence: 0.50, savedAtMs: 3000 }),
  ];

  it('filters reddit + min confidence 50, sorted oldest first', () => {
    const prefs: HistoryFilterPrefs = {
      platforms: ['reddit'],
      minConfidence: 50,
      maxConfidence: 100,
      sort: 'oldest',
    };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('r-high');
  });

  it('filters instagram, returns one result', () => {
    const prefs: HistoryFilterPrefs = {
      ...DEFAULT_FILTER_PREFS,
      platforms: ['instagram'],
    };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('i-mid');
  });

  it('confidence range that matches nothing returns empty', () => {
    const prefs: HistoryFilterPrefs = {
      platforms: ['reddit'],
      minConfidence: 90,
      maxConfidence: 100,
      sort: 'newest',
    };
    const result = applyFiltersAndSort(entries, prefs);
    expect(result).toHaveLength(0);
  });

  it('empty input always returns empty', () => {
    const result = applyFiltersAndSort([], { ...DEFAULT_FILTER_PREFS, platforms: ['reddit'] });
    expect(result).toHaveLength(0);
  });
});
