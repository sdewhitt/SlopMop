/**
 * 32-bit FNV-1a hash helpers for stable, deterministic IDs.
 *
 * Output is not cryptographically secure; it is only for local dedupe keys
 * and compact fingerprints in extension state/history.
 */

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/** Returns an unsigned 32-bit FNV-1a hash for the given UTF-16 string. */
export function fnv1a32(input: string): number {
  let hash = FNV_OFFSET_BASIS_32;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME_32) >>> 0;
  }
  return hash >>> 0;
}

/** Returns a zero-padded lower-case 8-char hex digest of {@link fnv1a32}. */
export function fnv1a32Hex(input: string): string {
  return fnv1a32(input).toString(16).padStart(8, '0');
}
