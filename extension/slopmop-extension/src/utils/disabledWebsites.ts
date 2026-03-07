/**
 * Utilities for the "Disabled Websites" feature.
 *
 * Ignored sites are stored in browser.storage.local under the key
 * 'ignoredSites' as a plain string[] of normalised hostnames (e.g. "example.com").
 * The background script keeps this in sync with Firestore for authenticated users.
 *
 * TODO: When detection logic reads from storage it should call isHostIgnored()
 * against the current tab's hostname before running any analysis.
 */

import browser from 'webextension-polyfill';

export const IGNORED_SITES_KEY = 'ignoredSites';

// ── Storage helpers ───────────────────────────────────────────────

export async function getIgnoredSites(): Promise<string[]> {
  const result = await browser.storage.local.get(IGNORED_SITES_KEY);
  return (result[IGNORED_SITES_KEY] as string[]) ?? [];
}

export async function setIgnoredSites(sites: string[]): Promise<void> {
  await browser.storage.local.set({ [IGNORED_SITES_KEY]: sites });
}

// ── Host matching ─────────────────────────────────────────────────

/**
 * Returns true if currentHost matches any entry in ignoredSites,
 * including subdomain matching:
 *   isHostIgnored("sub.example.com", ["example.com"]) → true
 *   isHostIgnored("example.com",     ["example.com"]) → true
 *   isHostIgnored("notexample.com",  ["example.com"]) → false
 *
 * TODO: Detection logic will call this before running FeedObserver
 * on any page load, and also reactively when storage changes.
 */
export function isHostIgnored(currentHost: string, ignoredSites: string[]): boolean {
  return ignoredSites.some(
    (site) => currentHost === site || currentHost.endsWith('.' + site),
  );
}

// ── Normalisation + validation ────────────────────────────────────

/**
 * Normalises a user-supplied URL or domain to a bare lowercase hostname.
 * "https://WWW.Example.com/path?q=1" → "example.com"
 * Returns empty string if parsing fails.
 */
export function normalizeHost(input: string): string {
  let s = input.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const url = new URL(s);
    let host = url.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
  } catch {
    return '';
  }
}

/** Returns an error string if the normalised host is invalid, otherwise null. */
export function validateHost(host: string): string | null {
  if (!host) return 'Enter a valid domain or URL (e.g. example.com).';
  if (/\s/.test(host)) return 'Domain must not contain spaces.';
  if (host !== 'localhost' && !host.includes('.')) return 'Enter a valid domain (e.g. example.com).';
  return null;
}
