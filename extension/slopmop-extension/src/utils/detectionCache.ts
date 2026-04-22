/**
 * 24-hour detection result cache backed by browser.storage.local.
 *
 * Stores full DetectionResponse objects keyed by postId so that
 * reopening the same post within 24 hours can skip the /detect API call.
 *
 * Privacy rules:
 *   - Entries older than 24 hours are pruned on every read/write.
 *   - Incognito tabs never write to the cache (enforced at the call site
 *     in the background script, same pattern as detectionHistory).
 *   - Cache reads in incognito are allowed (entry was written by a
 *     non-incognito tab).
 *
 * Storage budget:
 *   - Each CachedDetection is ~2-5 KB (full DetectionResponse with highlights).
 *   - 500 entries ≈ 1-2.5 MB, well within browser.storage.local's 10 MB quota.
 *   - Combined with detectionHistory (~200 KB for 1000 entries), total < 3 MB.
 */

import browser from 'webextension-polyfill';
import type { PostId, DetectionResponse } from '@src/types/domain';

export const CACHE_KEY = 'detectionCache';

/** Maximum number of entries retained after pruning. */
const MAX_CACHE_ENTRIES = 500;

/** 24 hours in milliseconds. */
export const TTL_MS = 24 * 60 * 60 * 1000;

// ── Schema ────────────────────────────────────────────────────────

export interface CachedDetection {
  postId: PostId;
  response: DetectionResponse;
  savedAtMs: number;
}

// ── Pruning ───────────────────────────────────────────────────────

/** Returns a copy with entries older than 24 hours removed. */
export function pruneCache(entries: CachedDetection[]): CachedDetection[] {
  const cutoff = Date.now() - TTL_MS;
  return entries.filter((e) => e.savedAtMs > cutoff);
}

// ── Storage helpers ───────────────────────────────────────────────

async function readRaw(): Promise<CachedDetection[]> {
  const result = await browser.storage.local.get(CACHE_KEY);
  return (result[CACHE_KEY] as CachedDetection[] | undefined) ?? [];
}

async function writeAll(entries: CachedDetection[]): Promise<void> {
  const pruned = pruneCache(entries);
  const capped = pruned.slice(-MAX_CACHE_ENTRIES);
  await browser.storage.local.set({ [CACHE_KEY]: capped });
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Looks up a cached DetectionResponse for the given postId.
 * Prunes expired entries as a side-effect (written back only when
 * entries were actually removed).
 */
export async function getCachedDetection(
  postId: PostId,
): Promise<DetectionResponse | null> {
  const raw = await readRaw();
  const pruned = pruneCache(raw);

  if (pruned.length !== raw.length) {
    await browser.storage.local.set({ [CACHE_KEY]: pruned });
  }

  const entry = pruned.find((e) => e.postId === postId);
  return entry?.response ?? null;
}

/**
 * Looks up the full cached entry (including savedAtMs) for the given postId.
 * Callers that need to compute `cache.ttlRemainingMs` or log cache age should
 * prefer this over {@link getCachedDetection}.
 */
export async function getCachedDetectionEntry(
  postId: PostId,
): Promise<CachedDetection | null> {
  const raw = await readRaw();
  const pruned = pruneCache(raw);

  if (pruned.length !== raw.length) {
    await browser.storage.local.set({ [CACHE_KEY]: pruned });
  }

  return pruned.find((e) => e.postId === postId) ?? null;
}

/**
 * Returns every non-expired cache entry. Used by the content script to prime
 * an in-memory lookup before the first scan so cached verdicts can render
 * without a round-trip through the background script.
 */
export async function getAllCachedDetections(): Promise<CachedDetection[]> {
  const raw = await readRaw();
  const pruned = pruneCache(raw);

  if (pruned.length !== raw.length) {
    await browser.storage.local.set({ [CACHE_KEY]: pruned });
  }

  return pruned;
}

/**
 * Returns ms until the cached entry expires, clamped to [0, TTL_MS].
 * Callers building a cache-hit {@link DetectionResponse} use this to fill
 * `explanation.cache.ttlRemainingMs`.
 */
export function computeTtlRemainingMs(savedAtMs: number, nowMs: number = Date.now()): number {
  const remaining = TTL_MS - (nowMs - savedAtMs);
  if (remaining <= 0) return 0;
  if (remaining > TTL_MS) return TTL_MS;
  return remaining;
}

/**
 * Saves (or updates) a detection result in the cache.
 * If an entry with the same postId already exists, its response and
 * savedAtMs are replaced.
 */
export async function saveCachedDetection(
  postId: PostId,
  response: DetectionResponse,
): Promise<void> {
  const current = await readRaw();
  const pruned = pruneCache(current);

  const existingIndex = pruned.findIndex((e) => e.postId === postId);
  const entry: CachedDetection = { postId, response, savedAtMs: Date.now() };

  if (existingIndex !== -1) {
    pruned[existingIndex] = entry;
  } else {
    pruned.push(entry);
  }

  await writeAll(pruned);
}

/** Removes all cached detection entries. */
export async function clearDetectionCache(): Promise<void> {
  await browser.storage.local.set({ [CACHE_KEY]: [] });
}
