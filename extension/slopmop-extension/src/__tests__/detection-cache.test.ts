import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock storage ──────────────────────────────────────────────────

let store: Record<string, unknown> = {};

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => {
          return { [key]: store[key] };
        }),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
      },
    },
  },
}));

import {
  pruneCache,
  getCachedDetection,
  saveCachedDetection,
  clearDetectionCache,
  CACHE_KEY,
  type CachedDetection,
} from '@src/utils/detectionCache';
import type { DetectionResponse } from '@src/types/domain';

// ── Helpers ───────────────────────────────────────────────────────

function makeResponse(postId: string, confidence = 0.85): DetectionResponse {
  return {
    requestId: `req-${postId}`,
    postId,
    verdict: 'likely_ai',
    confidence,
    explanation: {
      summary: 'Test explanation',
      model: { name: 'test', version: '1.0' },
      cache: { hit: false, ttlRemainingMs: 0 },
      timing: { totalMs: 100, inferenceMs: 80 },
    },
  };
}

function makeEntry(
  postId: string,
  savedAtMs = Date.now(),
): CachedDetection {
  return {
    postId,
    response: makeResponse(postId),
    savedAtMs,
  };
}

const HOUR_MS = 60 * 60 * 1000;

// ── Tests ─────────────────────────────────────────────────────────

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
});

describe('pruneCache', () => {
  it('drops entries older than 24 hours', () => {
    const old = makeEntry('old', Date.now() - 25 * HOUR_MS);
    const fresh = makeEntry('fresh', Date.now() - 1 * HOUR_MS);
    const result = pruneCache([old, fresh]);
    expect(result).toHaveLength(1);
    expect(result[0].postId).toBe('fresh');
  });

  it('keeps entries exactly at the 24-hour boundary', () => {
    const borderline = makeEntry('edge', Date.now() - 24 * HOUR_MS + 100);
    expect(pruneCache([borderline])).toHaveLength(1);
  });

  it('returns empty for all-expired entries', () => {
    const entries = [
      makeEntry('a', Date.now() - 30 * HOUR_MS),
      makeEntry('b', Date.now() - 48 * HOUR_MS),
    ];
    expect(pruneCache(entries)).toHaveLength(0);
  });
});

describe('getCachedDetection', () => {
  it('returns null for an unknown postId', async () => {
    store[CACHE_KEY] = [makeEntry('post-1')];
    const result = await getCachedDetection('unknown-id');
    expect(result).toBeNull();
  });

  it('returns the stored response for a known postId', async () => {
    const entry = makeEntry('post-1');
    store[CACHE_KEY] = [entry];
    const result = await getCachedDetection('post-1');
    expect(result).toEqual(entry.response);
  });

  it('returns null for an expired entry', async () => {
    store[CACHE_KEY] = [makeEntry('old', Date.now() - 25 * HOUR_MS)];
    const result = await getCachedDetection('old');
    expect(result).toBeNull();
  });

  it('returns null when storage is empty', async () => {
    const result = await getCachedDetection('anything');
    expect(result).toBeNull();
  });
});

describe('saveCachedDetection', () => {
  it('stores a new entry', async () => {
    const response = makeResponse('post-1');
    await saveCachedDetection('post-1', response);

    const stored = store[CACHE_KEY] as CachedDetection[];
    expect(stored).toHaveLength(1);
    expect(stored[0].postId).toBe('post-1');
    expect(stored[0].response).toEqual(response);
  });

  it('replaces an existing entry and refreshes savedAtMs', async () => {
    const oldTime = Date.now() - 10 * HOUR_MS;
    store[CACHE_KEY] = [makeEntry('post-1', oldTime)];

    const updatedResponse = makeResponse('post-1', 0.99);
    await saveCachedDetection('post-1', updatedResponse);

    const stored = store[CACHE_KEY] as CachedDetection[];
    expect(stored).toHaveLength(1);
    expect(stored[0].response.confidence).toBe(0.99);
    expect(stored[0].savedAtMs).toBeGreaterThan(oldTime);
  });

  it('caps entries at 500', async () => {
    const entries: CachedDetection[] = [];
    for (let i = 0; i < 500; i++) {
      entries.push(makeEntry(`post-${i}`));
    }
    store[CACHE_KEY] = entries;

    await saveCachedDetection('post-new', makeResponse('post-new'));

    const stored = store[CACHE_KEY] as CachedDetection[];
    expect(stored.length).toBeLessThanOrEqual(500);
    expect(stored.some((e) => e.postId === 'post-new')).toBe(true);
  });

  it('prunes expired entries when saving', async () => {
    store[CACHE_KEY] = [
      makeEntry('expired', Date.now() - 25 * HOUR_MS),
      makeEntry('fresh'),
    ];

    await saveCachedDetection('new', makeResponse('new'));

    const stored = store[CACHE_KEY] as CachedDetection[];
    expect(stored.every((e) => e.postId !== 'expired')).toBe(true);
  });
});

describe('clearDetectionCache', () => {
  it('removes all entries', async () => {
    store[CACHE_KEY] = [makeEntry('a'), makeEntry('b')];
    await clearDetectionCache();
    const stored = store[CACHE_KEY] as CachedDetection[];
    expect(stored).toHaveLength(0);
  });
});
