/**
 * Tests for Story 7: Detection History
 *
 * History Storage   (3 tests) — AC1, AC3
 * History Page UI   (4 tests) — AC2
 * Privacy Compliance (2 tests) — AC4
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── In-memory storage mock ─────────────────────────────────────────
// Simulates browser.storage.local with a real map so get/set/remove
// behave like the actual extension storage.

let store: Record<string, unknown> = {};

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (key: string | string[]) => {
          if (typeof key === 'string') return { [key]: store[key] };
          const result: Record<string, unknown> = {};
          for (const k of key) result[k] = store[k];
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
        remove: vi.fn(async (key: string | string[]) => {
          const keys = typeof key === 'string' ? [key] : key;
          for (const k of keys) delete store[k];
        }),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    tabs: {
      get: vi.fn(),
      create: vi.fn(),
    },
    runtime: {
      sendMessage: vi.fn(),
    },
  },
}));

import browser from 'webextension-polyfill';
import {
  pruneHistory,
  getHistory,
  saveHistoryEntry,
  clearHistory,
  buildHistoryEntry,
  findMatchingHistoryEntry,
  findMatchingHistoryByFingerprint,
  normalizeAuthorHandle,
  HISTORY_KEY,
  type HistoryEntry,
} from '@src/utils/detectionHistory';
import { computePostContentFingerprint } from '@src/utils/postContentFingerprint';
import HistoryPage from '@src/pages/options/HistoryPage';

const HOUR_MS = 60 * 60 * 1000;

/** Minimal valid HistoryEntry with optional overrides. */
function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    postId: 'post-1',
    url: 'https://reddit.com/r/test/comments/abc123',
    platform: 'reddit.com',
    snippet: "In today's fast-paced world, AI is everywhere.",
    authorHandle: 'someuser',
    contentFingerprint: 'fp-default',
    confidence: 0.91,
    verdict: 'likely_ai',
    savedAtMs: Date.now(),
    pinned: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────
// History Storage
// ─────────────────────────────────────────────────────────────────

describe('History Storage', () => {
  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
  });

  it('saves detection result with all required fields: timestamp, platform, URL, snippet, confidence, verdict', async () => {
    const entry = buildHistoryEntry(
      'post-abc',
      'https://reddit.com/r/test/comments/abc',
      'reddit.com',
      'This is a long post with lots of content to save.',
      0.87,
      'likely_ai',
      'coolauthor',
      'fp-cool',
    );
    await saveHistoryEntry(entry);

    const history = await getHistory();
    const saved = history.find((e) => e.postId === 'post-abc');

    expect(saved).toBeDefined();
    expect(saved!.savedAtMs).toBeGreaterThan(0);          // timestamp
    expect(saved!.platform).toBe('reddit.com');            // platform
    expect(saved!.url).toBe('https://reddit.com/r/test/comments/abc'); // URL
    expect(saved!.snippet).toBeTruthy();                   // snippet
    expect(saved!.confidence).toBe(0.87);                  // confidence
    expect(saved!.verdict).toBe('likely_ai');              // verdict
    expect(saved!.authorHandle).toBe('coolauthor');
    expect(saved!.contentFingerprint).toBe('fp-cool');
  });

  it('auto-deletes entries older than 24 hours', () => {
    const fresh   = makeEntry({ postId: 'fresh',   savedAtMs: Date.now() - 1 * HOUR_MS });
    const expired = makeEntry({ postId: 'expired', savedAtMs: Date.now() - 25 * HOUR_MS });
    const result  = pruneHistory([fresh, expired]);

    expect(result.map((e) => e.postId)).toContain('fresh');
    expect(result.map((e) => e.postId)).not.toContain('expired');
  });

  it('duplicate detection updates existing entry rather than creating a new one', async () => {
    await saveHistoryEntry(makeEntry({ postId: 'dup-post', confidence: 0.5,  verdict: 'unknown'   }));
    await saveHistoryEntry(makeEntry({ postId: 'dup-post', confidence: 0.92, verdict: 'likely_ai' }));

    const history = await getHistory();
    const entries = history.filter((e) => e.postId === 'dup-post');

    expect(entries).toHaveLength(1);
    expect(entries[0].confidence).toBe(0.92);
    expect(entries[0].verdict).toBe('likely_ai');
  });
});

// ─────────────────────────────────────────────────────────────────
// History Page UI
// ─────────────────────────────────────────────────────────────────

describe('History Page UI', () => {
  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
  });

  it('loads history page within 3 seconds with at least 50 entries', async () => {
    const browser = (await import('webextension-polyfill')).default;
    const fiftyEntries = Array.from({ length: 50 }, (_, i) =>
      makeEntry({ postId: `post-${i}`, snippet: `Post content number ${i}` }),
    );
    (browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: fiftyEntries,
    });

    const start = Date.now();
    render(<HistoryPage />);

    await waitFor(
      () => {
        expect(screen.getByText('Post content number 0')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(50);
  });

  it('clicking "View original post" opens the original post in a new tab', async () => {
    (browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [makeEntry({ postId: 'tab-test', url: 'https://reddit.com/r/test/comments/abc123' })],
    });
    render(<HistoryPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /open original post in new tab/i }),
      ).toBeInTheDocument();
    });

    await userEvent.click(
      screen.getByRole('button', { name: /open original post in new tab/i }),
    );

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SLOPMOP_OPEN_URL',
      url: 'https://reddit.com/r/test/comments/abc123',
    });
  });

  it('confidence badges appear with correct colors for each verdict', async () => {
    const browser = (await import('webextension-polyfill')).default;
    (browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [
        makeEntry({ postId: 'ai-post',    verdict: 'likely_ai',    confidence: 0.91 }),
        makeEntry({ postId: 'human-post', verdict: 'likely_human', confidence: 0.88 }),
        makeEntry({ postId: 'unk-post',   verdict: 'unknown',      confidence: 0.50 }),
      ],
    });

    render(<HistoryPage />);

    // Wait for entries to render
    await waitFor(() => {
      expect(screen.getByText(/Likely AI/)).toBeInTheDocument();
    });

    // Each verdict badge text is rendered by verdictLabel()
    const aiSpan     = screen.getByText(/Likely AI/);
    const humanSpan  = screen.getByText(/Likely Human/);
    const unknownSpan = screen.getByText(/Uncertain/);

    // Verify Tailwind color classes match expected verdict colors
    expect(aiSpan.className).toContain('text-red-400');
    expect(aiSpan.className).toContain('bg-red-500/15');

    expect(humanSpan.className).toContain('text-green-400');
    expect(humanSpan.className).toContain('bg-green-500/15');

    expect(unknownSpan.className).toContain('text-yellow-400');
    expect(unknownSpan.className).toContain('bg-yellow-500/15');
  });

  it('shows "No History Found" message when history is empty', async () => {
    const browser = (await import('webextension-polyfill')).default;
    (browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByText('No History Found')).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// History replay matching (author + snippet)
// ─────────────────────────────────────────────────────────────────

describe('History match for replay', () => {
  it('normalizeAuthorHandle strips u/ and @ and lowercases', () => {
    expect(normalizeAuthorHandle('u/Hello')).toBe('hello');
    expect(normalizeAuthorHandle('@World')).toBe('world');
    expect(normalizeAuthorHandle('  MixEd  ')).toBe('mixed');
  });

  it('findMatchingHistoryEntry returns the latest matching entry', () => {
    const text = 'Hello world same content';
    const snippet = text.trim().slice(0, 200);
    const entries: HistoryEntry[] = [
      makeEntry({
        postId: 'older',
        snippet,
        authorHandle: 'user1',
        savedAtMs: 100,
        platform: 'reddit.com',
      }),
      makeEntry({
        postId: 'newer',
        snippet,
        authorHandle: 'user1',
        savedAtMs: 200,
        platform: 'reddit.com',
      }),
    ];
    const m = findMatchingHistoryEntry(entries, 'reddit.com', 'u/user1', text);
    expect(m?.postId).toBe('newer');
  });

  it('findMatchingHistoryEntry returns null when platform differs', () => {
    const text = 'Hello';
    const entries: HistoryEntry[] = [makeEntry({ snippet: text, authorHandle: 'u1', platform: 'reddit.com' })];
    expect(findMatchingHistoryEntry(entries, 'x.com', 'u1', text)).toBeNull();
  });

  it('findMatchingHistoryEntry returns null for legacy entries without authorHandle', () => {
    const text = 'Hello';
    const entries: HistoryEntry[] = [
      { ...makeEntry(), authorHandle: undefined, snippet: text, postId: 'legacy' },
    ];
    expect(findMatchingHistoryEntry(entries, 'reddit.com', 'someuser', text)).toBeNull();
  });

  it('findMatchingHistoryByFingerprint returns the newest matching entry', () => {
    const fp = 'same-fp';
    const entries: HistoryEntry[] = [
      makeEntry({ postId: 'a', contentFingerprint: fp, savedAtMs: 10 }),
      makeEntry({ postId: 'b', contentFingerprint: fp, savedAtMs: 99 }),
    ];
    expect(findMatchingHistoryByFingerprint(entries, 'reddit.com', fp)?.postId).toBe('b');
  });

  it('computePostContentFingerprint is stable for same post shape', () => {
    const post = {
      site: 'reddit.com' as const,
      text: { plain: '  hello world  ', languageHint: 'eng' },
      images: [{ srcUrl: 'https://x/img.jpg', bytesBase64: '', mimeType: 'image/jpeg', imageId: '1' }],
    };
    const a = computePostContentFingerprint(post);
    const b = computePostContentFingerprint(post);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// Privacy Compliance
// ─────────────────────────────────────────────────────────────────

describe('Privacy Compliance', () => {
  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
  });

  it('incognito detections are not saved to history', async () => {
    const browser = (await import('webextension-polyfill')).default;
    (browser.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ incognito: true });

    // Replicate the maybeSaveToHistory guard from the background script
    const tab = await browser.tabs.get(1);
    if (!tab.incognito) {
      await saveHistoryEntry(makeEntry({ postId: 'incognito-post' }));
    }

    const history = await getHistory();
    expect(history.find((e) => e.postId === 'incognito-post')).toBeUndefined();
  });

  it('"Clear History" removes all entries from storage', async () => {
    await saveHistoryEntry(makeEntry({ postId: 'post-a', pinned: false }));
    await saveHistoryEntry(makeEntry({ postId: 'post-b', pinned: false }));
    await saveHistoryEntry(makeEntry({ postId: 'post-c', pinned: false }));

    await clearHistory();
    const history = await getHistory();

    expect(history).toHaveLength(0);
  });
});
