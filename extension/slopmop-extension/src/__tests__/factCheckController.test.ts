import { describe, it, expect, vi, beforeEach } from 'vitest';

import browser from 'webextension-polyfill';
import { handleFactCheckRequest, FACT_CHECK_CACHE_KEY } from '@src/pages/background/factCheckController';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
      },
    },
    tabs: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('@src/lib/api', () => ({
  factCheckText: vi.fn(),
  satireCheckText: vi.fn(),
}));

const { factCheckText, satireCheckText } = await import('@src/lib/api');

describe('factCheckController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    vi.mocked(browser.storage.local.set).mockResolvedValue(undefined);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValue(undefined);
  });

  it('satire-high: sorts items and stores satire in payload + cache', async () => {
    vi.mocked(factCheckText).mockResolvedValue({
      items: [
        { query_text: '', claim: 'a', verdict: 'False', source: 's', url: 'u1' },
        { query_text: '', claim: 'b', verdict: 'Mostly true', source: 's', url: 'u2' },
      ],
    });
    vi.mocked(satireCheckText).mockResolvedValue({
      satire_score: 0.9,
      label: 'satire',
      explanation: 'e',
    });

    await handleFactCheckRequest({
      text: 'hello',
      postId: 'p1',
      tabId: 1,
      site: 'reddit.com',
      contentFingerprint: 'fp-1',
    });

    // lastFactCheckResult payload should contain satire + sorted items
    const setCalls = vi.mocked(browser.storage.local.set).mock.calls;
    const lastWrite = setCalls.find((c) => (c[0] as any).lastFactCheckResult)?.[0] as any;
    expect(lastWrite).toBeTruthy();
    expect(lastWrite.lastFactCheckResult.satire.score).toBeCloseTo(0.9);
    expect(lastWrite.lastFactCheckResult.items[0].verdict).toBe('Mostly true');
    expect(lastWrite.lastFactCheckResult.items[1].verdict).toBe('False');
    expect(typeof lastWrite.lastFactCheckResult.factCheckMs).toBe('number');
    expect(lastWrite.lastFactCheckResult.factCheckMs).toBeGreaterThanOrEqual(0);

    // cache write should include satire
    const cacheWrite = setCalls.find((c) => (c[0] as any)[FACT_CHECK_CACHE_KEY])?.[0] as any;
    expect(cacheWrite).toBeTruthy();
    const cacheObj = cacheWrite[FACT_CHECK_CACHE_KEY];
    expect(Object.values(cacheObj)[0].satire.score).toBeCloseTo(0.9);
  });

  it('satire-low: leaves item order unchanged', async () => {
    vi.mocked(factCheckText).mockResolvedValue({
      items: [
        { query_text: '', claim: 'a', verdict: 'False', source: 's', url: 'u1' },
        { query_text: '', claim: 'b', verdict: 'Mostly true', source: 's', url: 'u2' },
      ],
    });
    vi.mocked(satireCheckText).mockResolvedValue({
      satire_score: 0.1,
      label: 'non_satire',
      explanation: 'e',
    });

    await handleFactCheckRequest({
      text: 'hello',
      postId: 'p1',
      tabId: 1,
      site: 'reddit.com',
      contentFingerprint: 'fp-2',
    });

    const setCalls = vi.mocked(browser.storage.local.set).mock.calls;
    const lastWrite = setCalls.find((c) => (c[0] as any).lastFactCheckResult)?.[0] as any;
    expect(lastWrite.lastFactCheckResult.items[0].verdict).toBe('False');
    expect(lastWrite.lastFactCheckResult.items[1].verdict).toBe('Mostly true');
  });

  it('satire endpoint down: still returns fact-check items (no satire)', async () => {
    vi.mocked(factCheckText).mockResolvedValue({
      items: [{ query_text: '', claim: 'a', verdict: 'False', source: 's', url: 'u1' }],
    });
    vi.mocked(satireCheckText).mockRejectedValue(new Error('down'));

    await expect(
      handleFactCheckRequest({
        text: 'hello',
        postId: 'p1',
        tabId: 1,
        site: 'reddit.com',
        contentFingerprint: 'fp-3',
      }),
    ).resolves.toMatchObject({ success: true });

    const setCalls = vi.mocked(browser.storage.local.set).mock.calls;
    const lastWrite = setCalls.find((c) => (c[0] as any).lastFactCheckResult)?.[0] as any;
    expect(lastWrite.lastFactCheckResult.satire).toBeUndefined();
  });

  it('uses API fact_check_ms when present, otherwise client wall-clock', async () => {
    vi.mocked(factCheckText).mockResolvedValue({
      items: [{ query_text: '', claim: 'a', verdict: 'False', source: 's', url: 'u1' }],
      fact_check_ms: 42,
    });
    vi.mocked(satireCheckText).mockResolvedValue({
      satire_score: 0.1,
      label: 'non_satire',
      explanation: 'e',
    });

    await handleFactCheckRequest({
      text: 'hello',
      postId: 'p1',
      tabId: 1,
      site: 'reddit.com',
      contentFingerprint: 'fp-api-ms',
    });

    let setCalls = vi.mocked(browser.storage.local.set).mock.calls;
    let lastWrite = setCalls.find((c) => (c[0] as any).lastFactCheckResult)?.[0] as any;
    expect(lastWrite.lastFactCheckResult.factCheckMs).toBe(42);

    vi.clearAllMocks();
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    vi.mocked(browser.storage.local.set).mockResolvedValue(undefined);
    vi.mocked(factCheckText).mockResolvedValue({
      items: [{ query_text: '', claim: 'b', verdict: 'True', source: 's', url: 'u2' }],
    });
    vi.mocked(satireCheckText).mockResolvedValue({
      satire_score: 0.1,
      label: 'non_satire',
      explanation: 'e',
    });

    await handleFactCheckRequest({
      text: 'hello2',
      postId: 'p2',
      tabId: 1,
      site: 'reddit.com',
      contentFingerprint: 'fp-fallback-ms',
    });

    setCalls = vi.mocked(browser.storage.local.set).mock.calls;
    lastWrite = setCalls.find((c) => (c[0] as any).lastFactCheckResult)?.[0] as any;
    expect(typeof lastWrite.lastFactCheckResult.factCheckMs).toBe('number');
    expect(lastWrite.lastFactCheckResult.factCheckMs).toBeGreaterThanOrEqual(0);
  });

  it('cache hit: returns cached items and does not call APIs', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      [FACT_CHECK_CACHE_KEY]: {
        'fp-4': {
          updatedAtMs: Date.now(),
          items: [{ query_text: '', claim: 'cached', verdict: 'False', source: 's', url: 'u1' }],
          satire: { score: 0.88, label: 'satire', source: 'model', computedAtMs: 1 },
        },
      },
    });

    await handleFactCheckRequest({
      text: 'hello',
      postId: 'p1',
      tabId: 1,
      site: 'reddit.com',
      contentFingerprint: 'fp-4',
    });

    expect(vi.mocked(factCheckText)).not.toHaveBeenCalled();
    expect(vi.mocked(satireCheckText)).not.toHaveBeenCalled();
    expect(vi.mocked(browser.tabs.sendMessage)).toHaveBeenCalledTimes(1);
  });
});

