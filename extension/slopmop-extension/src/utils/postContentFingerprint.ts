import type { MediaType } from '@src/types/domain';
import { fnv1a32Hex } from '@src/utils/fnv1aHash';

type FingerprintImageLike = {
  srcUrl?: string;
  imageId?: string;
  mimeType?: string;
  mediaType?: MediaType;
};

type FingerprintPostLike = {
  site?: string;
  text?: { plain?: string };
  images?: FingerprintImageLike[];
};

const MAX_TEXT_CHARS = 1200;
const MAX_IMAGES = 8;

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Stable, privacy-preserving fingerprint for repost/same-media replay lookups.
 *
 * Includes platform, normalized text, and normalized media signatures.
 */
export function computePostContentFingerprint(post: FingerprintPostLike): string {
  const platform = (post.site ?? '').trim().toLowerCase();
  const normalizedText = normalizeWhitespace(post.text?.plain ?? '').slice(0, MAX_TEXT_CHARS);

  const imageSignatures = (post.images ?? [])
    .map((img) => {
      const src = (img.srcUrl ?? '').trim().toLowerCase();
      const imageId = (img.imageId ?? '').trim().toLowerCase();
      const mime = (img.mimeType ?? '').trim().toLowerCase();
      const media = (img.mediaType ?? '').trim().toLowerCase();
      return `${src}|${imageId}|${mime}|${media}`;
    })
    .filter((sig) => sig.length > 0)
    .sort()
    .slice(0, MAX_IMAGES);

  const canonical = [
    'v1',
    platform,
    normalizedText,
    imageSignatures.join('||'),
  ].join('\u241f');

  return fnv1a32Hex(canonical);
}
