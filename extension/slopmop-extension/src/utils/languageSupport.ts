/**
 * Language verification for detection (Story 39).
 * AI detection model is only run for supported languages.
 */
import { franc, francAll } from 'franc';

/** ISO 639-3 codes for languages we support. Includes 'sco' (Scots) so short English isn't misclassified as unsupported. */
export const SUPPORTED_LANGUAGE_CODES = ['eng', 'spa', 'sco'] as const;

/** Human-readable names for the supported languages (for UI). */
export const SUPPORTED_LANGUAGE_NAMES = 'English and Spanish';

/** Common ISO 639-3 code → human-readable name. Covers the most frequent franc outputs. */
const LANG_NAMES: Record<string, string> = {
  eng: 'English', spa: 'Spanish', sco: 'Scots',
  fra: 'French', deu: 'German', por: 'Portuguese', ita: 'Italian',
  nld: 'Dutch', rus: 'Russian', jpn: 'Japanese', cmn: 'Mandarin Chinese',
  kor: 'Korean', ara: 'Arabic', hin: 'Hindi', tur: 'Turkish',
  pol: 'Polish', vie: 'Vietnamese', ind: 'Indonesian', tha: 'Thai',
  swe: 'Swedish', dan: 'Danish', nor: 'Norwegian', fin: 'Finnish',
  ces: 'Czech', ron: 'Romanian', ell: 'Greek', heb: 'Hebrew',
  ukr: 'Ukrainian', cat: 'Catalan', hun: 'Hungarian', und: 'Undetermined',
};

function langName(code: string): string {
  return LANG_NAMES[code] ?? code;
}

/** Below this length we treat as undetermined (allow). */
const MIN_TEXT_LENGTH_FOR_DETECTION = 10;

/**
 * Only treat as unsupported when the top language is not supported AND franc's confidence is at least this (0–1).
 */
const UNSUPPORTED_CONFIDENCE_THRESHOLD = 0.85;

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
 */
export function isLanguageSupported(code: string): boolean {
  if (code === 'und') return true;
  return (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code);
}

/**
 * Uses francAll + confidence threshold: only treats as unsupported when the top language is not eng/spa/sco
 * AND franc's confidence score is at least UNSUPPORTED_CONFIDENCE_THRESHOLD.
 */
export function isTextLanguageSupported(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH_FOR_DETECTION) return true;

  // Strip hashtags, @-mentions, and URLs before detecting language.
  // These tokens are common on social media but aren't natural language,
  // and they cause franc to misclassify English posts as unsupported.
  const cleaned = trimmed
    .replace(/#\w+/g, '')
    .replace(/@\w+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
  if (cleaned.length < MIN_TEXT_LENGTH_FOR_DETECTION) return true;

  const tuples = francAll(cleaned, { minLength: MIN_TEXT_LENGTH_FOR_DETECTION });
  const top = tuples[0];
  if (!top) return true;
  const [code, confidence] = top as [string, number];
  if ((SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code)) return true;
  if (confidence >= UNSUPPORTED_CONFIDENCE_THRESHOLD) return false;
  return true;
}

/** Result of language support analysis — includes detected language and confidence for verbose reporting. */
export interface LanguageSupportInfo {
  supported: boolean;
  detectedCode: string;
  detectedName: string;
  confidence: number;
}

/**
 * Analyses the text and returns detailed language support info.
 * Callers can use this to build verbose error messages.
 */
export function getLanguageSupportInfo(text: string): LanguageSupportInfo {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH_FOR_DETECTION) {
    return { supported: true, detectedCode: 'und', detectedName: 'Undetermined', confidence: 0 };
  }

  const cleaned = trimmed
    .replace(/#\w+/g, '')
    .replace(/@\w+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
  if (cleaned.length < MIN_TEXT_LENGTH_FOR_DETECTION) {
    return { supported: true, detectedCode: 'und', detectedName: 'Undetermined', confidence: 0 };
  }

  const tuples = francAll(cleaned, { minLength: MIN_TEXT_LENGTH_FOR_DETECTION });
  const top = tuples[0];
  if (!top) return { supported: true, detectedCode: 'und', detectedName: 'Undetermined', confidence: 0 };

  const [code, confidence] = top as [string, number];
  const supported =
    (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code) ||
    confidence < UNSUPPORTED_CONFIDENCE_THRESHOLD;

  return { supported, detectedCode: code, detectedName: langName(code), confidence };
}

/** Build a two-line badge string with detected-language detail. */
export function buildUnsupportedBadge(info: LanguageSupportInfo): string {
  const pct = Math.round(info.confidence * 100);
  return `Unsupported language\nDetected: ${info.detectedName} (${pct}% confidence)\nSupported: ${SUPPORTED_LANGUAGE_NAMES}`;
}

/** Build a longer message for the popup / tooltip. */
export function buildUnsupportedMessage(info: LanguageSupportInfo): string {
  const pct = Math.round(info.confidence * 100);
  return `Language not supported. Detected ${info.detectedName} (ISO 639-3: ${info.detectedCode}) with ${pct}% confidence. Currently supported: ${SUPPORTED_LANGUAGE_NAMES}.`;
}

/** Two-line badge text for feed (generic fallback). */
export const UNSUPPORTED_LANGUAGE_BADGE = "Unsupported language\nEnglish and Spanish supported";

/** Full message for popup (generic fallback). */
export const UNSUPPORTED_LANGUAGE_MESSAGE =
  `Language not supported. Currently supported: ${SUPPORTED_LANGUAGE_NAMES}.`;
