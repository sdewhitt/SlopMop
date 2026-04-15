import { fnv1a32Hex } from '@src/utils/fnv1aHash';

/**
 * Stable fingerprint for fact-check caching.
 * Text-only by design so it does not change with image hydration or media URLs.
 */
export function computeFactCheckFingerprint(site: string, text: string): string {
  return fnv1a32Hex([site, text.trim()].join('\x1e'));
}

