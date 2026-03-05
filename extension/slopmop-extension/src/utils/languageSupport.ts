/**
 * Language verification for detection (Story 39).
 * AI detection model is only run for supported languages.
 */
import { franc } from 'franc';

/** ISO 639-3 codes for languages we support. */
export const SUPPORTED_LANGUAGE_CODES = ['eng', 'spa'] as const;

/** Human-readable names for the supported languages (for UI). */
export const SUPPORTED_LANGUAGE_NAMES = 'English and Spanish';

const MIN_TEXT_LENGTH_FOR_DETECTION = 20;

/**
 * Detects the language of the text (ISO 639-3 code).
 * Returns 'und' (undetermined) for very short or empty text.
 */
export function detectLanguage(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH_FOR_DETECTION) return 'und';
  const code = franc(trimmed, { minLength: MIN_TEXT_LENGTH_FOR_DETECTION });
  return code;
}

/**
 * Returns true if the given ISO 639-3 code is supported for AI detection.
 * 'und' (undetermined) is treated as supported so short text still gets a result.
 */
export function isLanguageSupported(code: string): boolean {
  if (code === 'und') return true;
  return (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code);
}

/** Two-line badge text for feed (saves horizontal space). */
export const UNSUPPORTED_LANGUAGE_BADGE = "Unsupported language\nEnglish and Spanish supported";

/** Full message for popup. */
export const UNSUPPORTED_LANGUAGE_MESSAGE =
  `Language not supported. Currently supported: ${SUPPORTED_LANGUAGE_NAMES}.`;
