/**
 * Language verification for detection (Story 39).
 * AI detection model is only run for supported languages.
 */
import { franc, francAll } from 'franc';

/** ISO 639-3 codes for languages we support. Includes 'sco' (Scots) so short English isn't misclassified as unsupported. */
export const SUPPORTED_LANGUAGE_CODES = ['eng', 'spa', 'sco'] as const;

/** Human-readable names for the supported languages (for UI). */
export const SUPPORTED_LANGUAGE_NAMES = 'English and Spanish';

/** Below this length we treat as undetermined (allow). */
const MIN_TEXT_LENGTH_FOR_DETECTION = 10;

/**
 * Only treat as unsupported when the top language is not supported AND franc's confidence is at least this (0–1).
 * Lower = fewer false "unsupported" on short/ambiguous English; higher = fewer false positives (other languages allowed through).
 */
const UNSUPPORTED_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Detects the language of the text (ISO 639-3 code).
 * Returns 'und' (undetermined) for very short or empty text.
 */
export function detectLanguage(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH_FOR_DETECTION) return 'und';
  return franc(trimmed, { minLength: MIN_TEXT_LENGTH_FOR_DETECTION });
}

/**
 * Returns true if the given ISO 639-3 code is supported for AI detection.
 * 'und' (undetermined) is treated as supported so short text still gets a result.
 */
export function isLanguageSupported(code: string): boolean {
  if (code === 'und') return true;
  return (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code);
}

/**
 * Uses francAll + confidence threshold: only treats as unsupported when the top language is not eng/spa/sco
 * AND franc's confidence score is at least UNSUPPORTED_CONFIDENCE_THRESHOLD. Reduces false "unsupported" on short English.
 */
export function isTextLanguageSupported(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH_FOR_DETECTION) return true;
  const tuples = francAll(trimmed, { minLength: MIN_TEXT_LENGTH_FOR_DETECTION });
  const top = tuples[0];
  if (!top) return true;
  const [code, confidence] = top as [string, number];
  if ((SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code)) return true;
  if (confidence >= UNSUPPORTED_CONFIDENCE_THRESHOLD) return false;
  return true;
}

/** Two-line badge text for feed (saves horizontal space). */
export const UNSUPPORTED_LANGUAGE_BADGE = "Unsupported language\nEnglish and Spanish supported";

/** Full message for popup. */
export const UNSUPPORTED_LANGUAGE_MESSAGE =
  `Language not supported. Currently supported: ${SUPPORTED_LANGUAGE_NAMES}.`;
