/**
 * Integration-style tests for the detection cache as used by the background
 * script's handleAnalyzePost flow:
 *
 * - Cache hit returns a response that can have cache.hit set to true.
 * - Cache miss returns null so the normal /detect path proceeds.
 * - Incognito guard: the caller (maybeSaveToCache) skips writes when
 *   tab.incognito is true — tested via the utility layer contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock storage ──────────────────────────────────────────────────

let store: Record<string, unknown> = {};

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
      },
    },
    tabs: {
      get: vi.fn(),
    },
  },
}));

import browser from 'webextension-polyfill';
import {
  getCachedDetection,
  saveCachedDetection,
  CACHE_KEY,
  type CachedDetection,
} from '@src/utils/detectionCache';
import type { DetectionResponse } from '@src/types/domain';

// ── Helpers ───────────────────────────────────────────────────────

function makeResponse(postId: string): DetectionResponse {
  return {
    requestId: `req-${postId}`,
    postId,
    verdict: 'likely_ai',
    confidence: 0.92,
    explanation: {
      summary: 'Repetitive phrasing',
      highlights: [{ start: 0, end: 20, reason: 'Template pattern' }],
      model: { name: 'slopmop-api', version: '1.0' },
      cache: { hit: false, ttlRemainingMs: 0 },
      timing: { totalMs: 450, inferenceMs: 320 },
    },
  };
}

/**
 * Simulates the maybeSaveToCache helper from background/index.ts:
 * check tab.incognito before writing.
 */
async function simulateMaybeSaveToCache(
  postId: string,
  response: DetectionResponse,
  tabId: number,
): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  if ((tab as { incognito?: boolean }).incognito) return;
  await saveCachedDetection(postId, response);
}

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────

describe('background cache integration', () => {
  it('cache hit: returns stored response that can be flagged as cached', async () => {
    const response = makeResponse('post-1');
    await saveCachedDetection('post-1', response);

    const cached = await getCachedDetection('post-1');
    expect(cached).not.toBeNull();

    // Background script would set cache.hit = true before sending to tab
    const cachedResponse: DetectionResponse = {
      ...cached!,
      explanation: {
        ...cached!.explanation,
        cache: { hit: true, ttlRemainingMs: 0 },
      },
    };

    expect(cachedResponse.explanation.cache.hit).toBe(true);
    expect(cachedResponse.postId).toBe('post-1');
    expect(cachedResponse.verdict).toBe('likely_ai');
    expect(cachedResponse.confidence).toBe(0.92);
    expect(cachedResponse.explanation.highlights).toHaveLength(1);
  });

  it('cache miss: unknown postId returns null so /detect proceeds', async () => {
    await saveCachedDetection('post-1', makeResponse('post-1'));
    const result = await getCachedDetection('unknown-post');
    expect(result).toBeNull();
  });

  it('incognito tab does not write to cache', async () => {
    vi.mocked(browser.tabs.get).mockResolvedValue({
      id: 42,
      index: 0,
      highlighted: false,
      active: true,
      pinned: false,
      incognito: true,
    } as browser.Tabs.Tab);

    await simulateMaybeSaveToCache(
      'post-incognito',
      makeResponse('post-incognito'),
      42,
    );

    const result = await getCachedDetection('post-incognito');
    expect(result).toBeNull();
  });

  it('non-incognito tab writes to cache successfully', async () => {
    vi.mocked(browser.tabs.get).mockResolvedValue({
      id: 1,
      index: 0,
      highlighted: false,
      active: true,
      pinned: false,
      incognito: false,
    } as browser.Tabs.Tab);

    await simulateMaybeSaveToCache('post-normal', makeResponse('post-normal'), 1);

    const result = await getCachedDetection('post-normal');
    expect(result).not.toBeNull();
    expect(result!.postId).toBe('post-normal');
  });

  it('second detection for same postId replaces stored payload', async () => {
    const first = makeResponse('post-1');
    first.confidence = 0.60;
    await saveCachedDetection('post-1', first);

    const second = makeResponse('post-1');
    second.confidence = 0.95;
    second.verdict = 'likely_ai';
    await saveCachedDetection('post-1', second);

    const stored = store[CACHE_KEY] as CachedDetection[];
    expect(stored.filter((e) => e.postId === 'post-1')).toHaveLength(1);

    const result = await getCachedDetection('post-1');
    expect(result!.confidence).toBe(0.95);
  });

  it('expired entry is not returned even if postId matches', async () => {
    const HOUR_MS = 60 * 60 * 1000;
    store[CACHE_KEY] = [
      {
        postId: 'old-post',
        response: makeResponse('old-post'),
        savedAtMs: Date.now() - 25 * HOUR_MS,
      },
    ];

    const result = await getCachedDetection('old-post');
    expect(result).toBeNull();
  });
});
