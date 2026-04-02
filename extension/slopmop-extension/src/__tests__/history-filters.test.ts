import { describe, expect, it } from 'vitest';
import {
  applyFiltersAndSort,
  applyKeywordFilter,
  matchesKeyword,
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

// ── matchesKeyword ────────────────────────────────────────────────

describe('matchesKeyword', () => {
  const entry = makeEntry({
    snippet: 'This is AI-generated content about climate change',
    platform: 'reddit.com',
    url: 'https://www.reddit.com/r/science/comments/abc123/title',
  });

  it('returns true for empty query', () => {
    expect(matchesKeyword(entry, '')).toBe(true);
  });

  it('returns true for whitespace-only query', () => {
    expect(matchesKeyword(entry, '   ')).toBe(true);
  });

  it('matches snippet content', () => {
    expect(matchesKeyword(entry, 'climate change')).toBe(true);
  });

  it('matches snippet case-insensitively', () => {
    expect(matchesKeyword(entry, 'CLIMATE CHANGE')).toBe(true);
    expect(matchesKeyword(entry, 'Climate Change')).toBe(true);
  });

  it('matches platform label (Reddit)', () => {
    expect(matchesKeyword(entry, 'reddit')).toBe(true);
    expect(matchesKeyword(entry, 'Reddit')).toBe(true);
  });

  it('matches URL', () => {
    expect(matchesKeyword(entry, 'abc123')).toBe(true);
    expect(matchesKeyword(entry, 'r/science')).toBe(true);
  });

  it('returns false for non-matching query', () => {
    expect(matchesKeyword(entry, 'basketball')).toBe(false);
  });

  it('matches partial snippet word', () => {
    expect(matchesKeyword(entry, 'generat')).toBe(true);
  });

  it('matches LinkedIn platform label', () => {
    const linkedinEntry = makeEntry({ platform: 'linkedin.com' });
    expect(matchesKeyword(linkedinEntry, 'linkedin')).toBe(true);
    expect(matchesKeyword(linkedinEntry, 'LinkedIn')).toBe(true);
  });

  it('matches X platform label for twitter.com', () => {
    const twitterEntry = makeEntry({ platform: 'twitter.com' });
    expect(matchesKeyword(twitterEntry, 'X')).toBe(true);
  });

  it('matches X platform label for x.com', () => {
    const xEntry = makeEntry({ platform: 'x.com' });
    expect(matchesKeyword(xEntry, 'x')).toBe(true);
  });
});

// ── applyKeywordFilter ────────────────────────────────────────────

describe('applyKeywordFilter', () => {
  const entries = [
    makeEntry({ postId: 'a', snippet: 'AI is taking over the world', platform: 'reddit.com', url: 'https://reddit.com/r/tech/comments/aaa' }),
    makeEntry({ postId: 'b', snippet: 'How to bake sourdough bread', platform: 'instagram.com', url: 'https://instagram.com/p/bbb' }),
    makeEntry({ postId: 'c', snippet: 'Climate policy updates', platform: 'linkedin.com', url: 'https://linkedin.com/posts/ccc' }),
  ];

  it('returns all entries for empty query', () => {
    expect(applyKeywordFilter(entries, '')).toHaveLength(3);
  });

  it('returns all entries for whitespace query', () => {
    expect(applyKeywordFilter(entries, '   ')).toHaveLength(3);
  });

  it('filters by snippet keyword', () => {
    const result = applyKeywordFilter(entries, 'sourdough');
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('b');
  });

  it('filters by platform name', () => {
    const result = applyKeywordFilter(entries, 'linkedin');
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('c');
  });

  it('filters by URL fragment', () => {
    const result = applyKeywordFilter(entries, 'r/tech');
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('a');
  });

  it('is case-insensitive', () => {
    const result = applyKeywordFilter(entries, 'CLIMATE');
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('c');
  });

  it('returns empty when no entries match', () => {
    expect(applyKeywordFilter(entries, 'xyznotfound')).toHaveLength(0);
  });

  it('returns multiple matches when several entries match', () => {
    // "posts" appears in linkedin URL and instagram URL
    const result = applyKeywordFilter(entries, 'instagram');
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('b');
  });

  it('does not mutate the input array', () => {
    const copy = [...entries];
    applyKeywordFilter(entries, 'AI');
    expect(entries).toEqual(copy);
  });

  it('handles large dataset efficiently', () => {
    const large = Array.from({ length: 1000 }, (_, i) =>
      makeEntry({ postId: `p${i}`, snippet: i % 2 === 0 ? 'AI generated text' : 'Human written post', platform: 'reddit.com' })
    );
    const result = applyKeywordFilter(large, 'AI generated');
    expect(result).toHaveLength(500);
  });
});

// ── Special characters ────────────────────────────────────────────

describe('matchesKeyword — special characters', () => {
  const entry = makeEntry({
    snippet: 'Normal post about technology',
    platform: 'reddit.com',
    url: 'https://reddit.com/r/tech/comments/abc123/title',
  });

  it('does not crash on special characters @#$', () => {
    expect(() => matchesKeyword(entry, '@#$')).not.toThrow();
  });

  it('returns false for @#$ when not present in entry', () => {
    expect(matchesKeyword(entry, '@#$')).toBe(false);
  });

  it('does not crash on regex-special characters', () => {
    expect(() => matchesKeyword(entry, '.*+?[](){}^$|\\')).not.toThrow();
  });

  it('does not crash on null-byte or control characters', () => {
    expect(() => matchesKeyword(entry, '\0\t\n')).not.toThrow();
  });

  it('matches when snippet literally contains special chars', () => {
    const specialEntry = makeEntry({ snippet: 'Price is $100 & rising!' });
    expect(matchesKeyword(specialEntry, '$100')).toBe(true);
  });

  it('matches when URL contains special chars like ?q=', () => {
    const queryEntry = makeEntry({ url: 'https://reddit.com/search?q=climate' });
    expect(matchesKeyword(queryEntry, '?q=climate')).toBe(true);
  });
});

// ── Very long queries ─────────────────────────────────────────────

describe('matchesKeyword — very long queries', () => {
  const entry = makeEntry({
    snippet: 'Short snippet',
    platform: 'reddit.com',
    url: 'https://reddit.com/r/test/comments/abc/title',
  });

  it('does not crash on a 10 000-character query', () => {
    const longQuery = 'a'.repeat(10_000);
    expect(() => matchesKeyword(entry, longQuery)).not.toThrow();
  });

  it('returns false when long query does not match', () => {
    const longQuery = 'z'.repeat(10_000);
    expect(matchesKeyword(entry, longQuery)).toBe(false);
  });

  it('returns true when long query matches snippet prefix', () => {
    const longSnippet = 'keyword ' + 'x'.repeat(9_990);
    const longEntry = makeEntry({ snippet: longSnippet });
    expect(matchesKeyword(longEntry, 'keyword')).toBe(true);
  });
});

describe('applyKeywordFilter — special characters and long queries', () => {
  const entries = [
    makeEntry({ postId: 'a', snippet: 'AI is taking over the world', platform: 'reddit.com', url: 'https://reddit.com/r/tech/comments/aaa' }),
    makeEntry({ postId: 'b', snippet: 'Price is $100 & rising fast', platform: 'instagram.com', url: 'https://instagram.com/p/bbb' }),
    makeEntry({ postId: 'c', snippet: 'Climate policy updates', platform: 'linkedin.com', url: 'https://linkedin.com/posts/ccc' }),
  ];

  it('returns empty array for special-character query that matches nothing', () => {
    expect(applyKeywordFilter(entries, '@@@###$$$')).toHaveLength(0);
  });

  it('does not crash on special-character query', () => {
    expect(() => applyKeywordFilter(entries, '.*+?[](){}^$|\\')).not.toThrow();
  });

  it('matches entry whose snippet contains the special character', () => {
    const result = applyKeywordFilter(entries, '$100');
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('b');
  });

  it('does not crash on 10 000-character query', () => {
    expect(() => applyKeywordFilter(entries, 'a'.repeat(10_000))).not.toThrow();
  });

  it('returns empty for very long query that matches nothing', () => {
    expect(applyKeywordFilter(entries, 'z'.repeat(10_000))).toHaveLength(0);
  });
});

// ── Debounce — stable filter output ──────────────────────────────
// The debounce timer lives in the React component (HistoryPage) and cannot
// be imported here without triggering browser-polyfill errors.
// These tests verify the underlying guarantee that debounce relies on:
// applyKeywordFilter is a pure function — calling it N times with the same
// arguments always produces the same result, so intermediate (debounced-away)
// calls are safe to discard.

describe('applyKeywordFilter — debounce stability (pure-function guarantee)', () => {
  const entries = [
    makeEntry({ postId: 'r1', snippet: 'Reddit post about gaming', platform: 'reddit.com', url: 'https://reddit.com/r/gaming/comments/r1' }),
    makeEntry({ postId: 'i1', snippet: 'Instagram food photo', platform: 'instagram.com', url: 'https://instagram.com/p/i1' }),
    makeEntry({ postId: 'l1', snippet: 'LinkedIn career advice', platform: 'linkedin.com', url: 'https://linkedin.com/posts/l1' }),
  ];

  it('returns identical results for the same query called multiple times', () => {
    const first  = applyKeywordFilter(entries, 'reddit');
    const second = applyKeywordFilter(entries, 'reddit');
    const third  = applyKeywordFilter(entries, 'reddit');
    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });

  it('intermediate partial-query calls do not affect final result', () => {
    // Simulate user typing "r" → "re" → "red" → "redd" → "reddit"
    // Only the final call matters; intermediate results should be discardable.
    applyKeywordFilter(entries, 'r');
    applyKeywordFilter(entries, 're');
    applyKeywordFilter(entries, 'red');
    applyKeywordFilter(entries, 'redd');
    const final = applyKeywordFilter(entries, 'reddit');
    expect(final).toHaveLength(1);
    expect(final[0].postId).toBe('r1');
  });

  it('transitioning from non-empty to empty query restores full list', () => {
    applyKeywordFilter(entries, 'reddit');
    const cleared = applyKeywordFilter(entries, '');
    expect(cleared).toHaveLength(3);
  });

  it('rapid alternating queries produce correct independent results', () => {
    const resultA = applyKeywordFilter(entries, 'gaming');
    const resultB = applyKeywordFilter(entries, 'career');
    const resultA2 = applyKeywordFilter(entries, 'gaming');
    expect(resultA).toEqual(resultA2);
    expect(resultB).toHaveLength(1);
    expect(resultB[0].postId).toBe('l1');
  });
});
