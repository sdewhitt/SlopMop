/**
 * Utilities for the "Detection History" feature (Story 7).
 *
 * History entries are stored in browser.storage.local under the key
 * 'detectionHistory' as a HistoryEntry[].
 *
 * Privacy rules:
 *   - Entries older than 24 hours are automatically pruned on every read/write.
 *   - Incognito detections are never saved (enforced at the call site in the background script).
 *   - Pinned entries are exempt from the 24-hour auto-deletion.
 *   - "Clear history" removes all unpinned entries only; pinned entries
 *     require explicit unpinning before they can be deleted.
 */

import browser from 'webextension-polyfill';
import type { PostId, SiteId, Verdict } from '@src/types/domain';

export const HISTORY_KEY = 'detectionHistory';

/** Maximum number of entries retained after pruning (safety cap). */
const MAX_HISTORY_ENTRIES = 1000;

/** 24 hours in milliseconds. */
const TTL_MS = 24 * 60 * 60 * 1000;

/** Must match {@link buildHistoryEntry} truncation (first N chars of trimmed text). */
export const HISTORY_SNIPPET_MAX_CHARS = 200;

// ── Schema ────────────────────────────────────────────────────────

export interface HistoryEntry {
  /** Stable post identifier (from NormalizedPostContent.postId). */
  postId: PostId;
  /** Full URL to the original post. */
  url: string;
  /** Platform hostname e.g. "reddit.com", "instagram.com". */
  platform: SiteId;
  /** First {@link HISTORY_SNIPPET_MAX_CHARS} characters of the post's plain text. */
  snippet: string;
  /** Poster handle for deduplication (e.g. Reddit username, X handle). Omitted on older entries. */
  authorHandle?: string;
  /** AI probability score 0–1 returned by the backend. */
  confidence: number;
  /** Model verdict. */
  verdict: Verdict;
  /** Unix timestamp (ms) when this entry was saved. */
  savedAtMs: number;
  /** When true, this entry is excluded from 24-hour auto-deletion. */
  pinned: boolean;
}

// ── Pruning ───────────────────────────────────────────────────────

/**
 * Returns a copy of the entries array with expired unpinned entries removed.
 * An entry is expired when it is older than 24 hours AND not pinned.
 */
export function pruneHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const cutoff = Date.now() - TTL_MS;
  return entries.filter((e) => e.pinned || e.savedAtMs > cutoff);
}

// ── Storage helpers ───────────────────────────────────────────────

/**
 * Reads the history from local storage, prunes expired entries, and
 * returns the live list. The pruned list is written back only when
 * entries were actually removed, avoiding unnecessary writes.
 */
export async function getHistory(): Promise<HistoryEntry[]> {
  const result = await browser.storage.local.get(HISTORY_KEY);
  const raw = (result[HISTORY_KEY] as HistoryEntry[] | undefined) ?? [];
  const pruned = pruneHistory(raw);

  if (pruned.length !== raw.length) {
    await browser.storage.local.set({ [HISTORY_KEY]: pruned });
  }

  return pruned;
}

/**
 * Overwrites the stored history with the provided array.
 * Pruning and the MAX_HISTORY_ENTRIES cap are applied before writing.
 */
async function setHistory(entries: HistoryEntry[]): Promise<void> {
  const pruned = pruneHistory(entries);
  const capped = pruned.slice(-MAX_HISTORY_ENTRIES);
  await browser.storage.local.set({ [HISTORY_KEY]: capped });
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Saves a detection result to history.
 *
 * If an entry with the same postId already exists it is updated in place
 * (confidence, verdict, snippet, and savedAtMs are refreshed) rather than
 * creating a duplicate.
 *
 * @param entry - The entry to save. `pinned` defaults to false if omitted.
 */
export async function saveHistoryEntry(
  entry: Omit<HistoryEntry, 'pinned'> & { pinned?: boolean },
): Promise<void> {
  const current = await getHistory();
  const normalizedEntry: HistoryEntry = { pinned: false, ...entry };

  const existingIndex = current.findIndex((e) => e.postId === entry.postId);

  if (existingIndex !== -1) {
    current[existingIndex] = {
      ...current[existingIndex],
      snippet: normalizedEntry.snippet,
      confidence: normalizedEntry.confidence,
      verdict: normalizedEntry.verdict,
      url: normalizedEntry.url,
      savedAtMs: normalizedEntry.savedAtMs,
      ...(normalizedEntry.authorHandle !== undefined && {
        authorHandle: normalizedEntry.authorHandle,
      }),
    };
  } else {
    current.push(normalizedEntry);
  }

  await setHistory(current);
}

/**
 * Removes all unpinned history entries.
 * Pinned entries are preserved and must be unpinned explicitly before deletion.
 */
export async function clearHistory(): Promise<void> {
  const current = await getHistory();
  const pinned = current.filter((e) => e.pinned);
  await browser.storage.local.set({ [HISTORY_KEY]: pinned });
}

/**
 * Toggles the pinned state of the entry with the given postId.
 * No-op if the postId is not found.
 */
export async function togglePin(postId: PostId): Promise<void> {
  const current = await getHistory();
  const index = current.findIndex((e) => e.postId === postId);
  if (index === -1) return;
  current[index] = { ...current[index], pinned: !current[index].pinned };
  await setHistory(current);
}

/**
 * Builds a HistoryEntry from the raw detection pipeline outputs.
 * Extracts only what is needed — keeps history storage lean.
 *
 * @param postId   - Stable post ID.
 * @param url      - Full URL to the original post.
 * @param platform - Hostname of the platform (e.g. "reddit.com").
 * @param text     - Full plain text of the post. Snippet is truncated to 200 chars.
 * @param confidence - AI probability 0–1.
 * @param verdict  - Model verdict string.
 */
export function buildHistoryEntry(
  postId: PostId,
  url: string,
  platform: SiteId,
  text: string,
  confidence: number,
  verdict: Verdict,
  authorHandle: string,
): Omit<HistoryEntry, 'pinned'> {
  return {
    postId,
    url,
    platform,
    snippet: normalizeContentSnippet(text),
    confidence,
    verdict,
    savedAtMs: Date.now(),
    authorHandle: authorHandle.trim(),
  };
}

/** Normalize handle for comparison across sites (u/, @, case). */
export function normalizeAuthorHandle(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (s.startsWith('u/')) s = s.slice(2);
  if (s.startsWith('@')) s = s.slice(1);
  return s;
}

/** Same truncation as stored history snippets. */
export function normalizeContentSnippet(text: string): string {
  return text.trim().slice(0, HISTORY_SNIPPET_MAX_CHARS);
}

/**
 * Finds the most recent history entry with the same platform, normalized author, and snippet.
 * Entries without `authorHandle` (legacy) never match.
 */
export function findMatchingHistoryEntry(
  entries: HistoryEntry[],
  platform: SiteId,
  authorHandleRaw: string,
  plainText: string,
): HistoryEntry | null {
  const h = normalizeAuthorHandle(authorHandleRaw);
  const snippet = normalizeContentSnippet(plainText);
  if (!h || !snippet) return null;

  let best: HistoryEntry | null = null;
  for (const e of entries) {
    if (e.platform !== platform) continue;
    const eh = normalizeAuthorHandle(e.authorHandle ?? '');
    if (!eh || eh !== h) continue;
    if (e.snippet !== snippet) continue;
    if (!best || e.savedAtMs > best.savedAtMs) best = e;
  }
  return best;
}
