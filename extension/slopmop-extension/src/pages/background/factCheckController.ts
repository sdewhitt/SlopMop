import browser from 'webextension-polyfill';
import type { FactCheckResultPayload, SatireSignal, SiteId } from '@src/types/domain';
import { computeFactCheckFingerprint } from '@src/utils/factCheckFingerprint';
import { satireSignalFromApiResponse, sortFactCheckItemsForSatire } from '@src/utils/factCheckSatire';
import { factCheckText, satireCheckText } from '@src/lib/api';

export const FACT_CHECK_CACHE_KEY = 'factCheckCacheV2' as const;
export const FACT_CHECK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type FactCheckCacheEntry = {
  updatedAtMs: number;
  items: FactCheckResultPayload['items'];
  satire?: SatireSignal;
  site?: SiteId;
  contentFingerprint?: string;
  factCheckMs?: number;
};

function isFactCheckCacheEntry(x: unknown): x is FactCheckCacheEntry {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.updatedAtMs === 'number' && Array.isArray(o.items);
}

export async function readFactCheckCache(): Promise<Record<string, FactCheckCacheEntry>> {
  const raw = await browser.storage.local.get(FACT_CHECK_CACHE_KEY);
  const v = raw[FACT_CHECK_CACHE_KEY];
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, FactCheckCacheEntry> = {};
  for (const [k, entry] of Object.entries(v as Record<string, unknown>)) {
    if (isFactCheckCacheEntry(entry)) out[k] = entry;
  }
  return out;
}

export async function writeFactCheckCache(key: string, entry: FactCheckCacheEntry): Promise<void> {
  const cache = await readFactCheckCache();
  cache[key] = entry;
  await browser.storage.local.set({ [FACT_CHECK_CACHE_KEY]: cache });
}

export async function handleFactCheckRequest(args: {
  text: string;
  postId: string;
  tabId: number;
  site?: SiteId;
  contentFingerprint?: string;
}): Promise<{ success: boolean; data?: { items: FactCheckResultPayload['items'] }; error?: string }> {
  const { text, postId, tabId } = args;
  const site = args.site;
  const contentFingerprint =
    (args.contentFingerprint && String(args.contentFingerprint)) ||
    (site ? computeFactCheckFingerprint(site, text) : undefined);
  const cacheKey = contentFingerprint;

  if (cacheKey) {
    const cache = await readFactCheckCache();
    const hit = cache[cacheKey];
    if (hit && Date.now() - hit.updatedAtMs <= FACT_CHECK_CACHE_TTL_MS) {
      const payload: FactCheckResultPayload = {
        postId,
        items: hit.items,
        satire: hit.satire,
        site,
        contentFingerprint,
        updatedAtMs: hit.updatedAtMs,
        ...(typeof hit.factCheckMs === 'number' ? { factCheckMs: hit.factCheckMs } : {}),
      };
      await browser.storage.local.set({
        lastFactCheckResult: payload,
        lastFactCheckError: null,
      });
      await browser.tabs.sendMessage(tabId, { type: 'FACT_CHECK_RESULT', payload }).catch(() => {});
      return { success: true, data: { items: hit.items } };
    }
  }

  const timedFactCheck = async (): Promise<{
    value: Awaited<ReturnType<typeof factCheckText>>;
    clientWallMs: number;
  }> => {
    const t0 = performance.now();
    const value = await factCheckText(text);
    const clientWallMs = Math.max(0, Math.round(performance.now() - t0));
    return { value, clientWallMs };
  };

  const [fc, satireRes] = await Promise.allSettled([timedFactCheck(), satireCheckText(text)]);
  if (fc.status !== 'fulfilled') {
    const e = fc.reason instanceof Error ? fc.reason : new Error('Fact check failed.');
    throw e;
  }

  const { value: fcValue, clientWallMs } = fc.value;
  const satire =
    satireRes.status === 'fulfilled' ? satireSignalFromApiResponse(satireRes.value, 'model') : undefined;
  const items = satire ? sortFactCheckItemsForSatire(fcValue.items, satire.score) : fcValue.items;
  const updatedAtMs = Date.now();
  const factCheckMsRaw = fcValue.fact_check_ms;
  const factCheckMsFromApi =
    typeof factCheckMsRaw === 'number' && Number.isFinite(factCheckMsRaw) && factCheckMsRaw >= 0
      ? Math.round(factCheckMsRaw)
      : undefined;
  const factCheckMs = factCheckMsFromApi ?? clientWallMs;

  const payload: FactCheckResultPayload = {
    postId,
    items,
    ...(satire ? { satire } : {}),
    ...(site ? { site } : {}),
    ...(contentFingerprint ? { contentFingerprint } : {}),
    updatedAtMs,
    factCheckMs,
  };

  await browser.storage.local.set({
    lastFactCheckResult: payload,
    lastFactCheckError: null,
  });

  if (cacheKey) {
    await writeFactCheckCache(cacheKey, {
      updatedAtMs,
      items,
      ...(satire ? { satire } : {}),
      ...(site ? { site } : {}),
      ...(contentFingerprint ? { contentFingerprint } : {}),
      factCheckMs,
    });
  }

  await browser.tabs.sendMessage(tabId, { type: 'FACT_CHECK_RESULT', payload }).catch(() => {});
  return { success: true, data: { items } };
}

