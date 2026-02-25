import browser from 'webextension-polyfill';

export interface DisabledWebsite {
  id: string;
  /** Normalized hostname, e.g. "example.com". Matches host + all subdomains. */
  value: string;
  createdAt: number;
}

const STORAGE_KEY = 'disabledWebsites';

export async function getDisabledWebsites(): Promise<DisabledWebsite[]> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as DisabledWebsite[]) ?? [];
}

export async function setDisabledWebsites(sites: DisabledWebsite[]): Promise<void> {
  // TODO: Detection logic will later read 'disabledWebsites' from storage here
  // and skip detection when the active tab's hostname matches any entry,
  // including subdomain matching (e.g. "example.com" should block "sub.example.com").
  await browser.storage.local.set({ [STORAGE_KEY]: sites });
}

/**
 * Normalizes a user-supplied URL or domain to a bare hostname.
 * "https://WWW.Example.com/path?q=1" → "example.com"
 * Returns empty string if parsing fails.
 */
export function normalizeHost(input: string): string {
  let s = input.trim();
  if (!s) return '';
  // Prepend protocol so URL() can parse plain domains.
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

/**
 * Returns an error string if the normalized host is invalid, otherwise null.
 */
export function validateHost(host: string): string | null {
  if (!host) return 'Enter a valid domain or URL (e.g. example.com).';
  if (/\s/.test(host)) return 'Domain must not contain spaces.';
  if (host !== 'localhost' && !host.includes('.')) return 'Enter a valid domain (e.g. example.com).';
  return null;
}
