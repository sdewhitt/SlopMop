/**
 * Language verification for detection (Story 39).
 * AI detection model is only run for languages the user enables in settings.
 */
import { franc, francAll } from 'franc';
import type { DetectionLanguageCode } from '@src/utils/userSettings';

/** ISO 639-3 codes the backend text model can handle. Scots is included for short-English disambiguation when English is enabled. */
export const SUPPORTED_LANGUAGE_CODES = ['eng', 'spa', 'fra', 'sco'] as const;

/** Default copy when listing model-capable languages (not user-specific). */
export const SUPPORTED_LANGUAGE_NAMES = 'English, Spanish, and French';

/** Expand user selection to franc ISO codes (add Scots when English is on). */
export function expandUserDetectionLanguages(selected: readonly DetectionLanguageCode[]): string[] {
  const s = new Set<string>();
  for (const c of selected) s.add(c);
  if (s.has('eng')) s.add('sco');
  return Array.from(s);
}

/** Human-readable list of enabled detection languages (for error copy). */
export function formatDetectionLanguagesForUi(selected: readonly DetectionLanguageCode[]): string {
  if (selected.length === 0) {
    return 'None — choose at least one language below';
  }
  const labels: Record<DetectionLanguageCode, string> = {
    eng: 'English',
    spa: 'Spanish',
    fra: 'French',
  };
  return selected.map((c) => labels[c]).join(', ');
}

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
 * Only treat as unsupported when the top language is not enabled AND franc's confidence is at least this (0–1).
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
 * Returns true if the given ISO 639-3 code is among model-capable languages.
 */
export function isLanguageSupported(code: string): boolean {
  if (code === 'und') return true;
  return (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code);
}

/**
 * Uses francAll + confidence threshold against **user-enabled** ISO codes.
 * @param enabledIso6393 Output of `expandUserDetectionLanguages(settings.detectionLanguages)`.
 */
export function isTextLanguageSupported(text: string, enabledIso6393: readonly string[]): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  if (enabledIso6393.length === 0) {
    return false;
  }

  if (trimmed.length < MIN_TEXT_LENGTH_FOR_DETECTION) return true;

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
  if (enabledIso6393.includes(code)) return true;
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
 * Analyses the text against user-enabled languages.
 */
export function getLanguageSupportInfo(
  text: string,
  enabledIso6393: readonly string[],
): LanguageSupportInfo {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH_FOR_DETECTION) {
    return { supported: true, detectedCode: 'und', detectedName: 'Undetermined', confidence: 0 };
  }

  if (enabledIso6393.length === 0) {
    const cleanedEarly = trimmed
      .replace(/#\w+/g, '')
      .replace(/@\w+/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim();
    if (cleanedEarly.length < MIN_TEXT_LENGTH_FOR_DETECTION) {
      return { supported: true, detectedCode: 'und', detectedName: 'Undetermined', confidence: 0 };
    }
    const tuplesEarly = francAll(cleanedEarly, { minLength: MIN_TEXT_LENGTH_FOR_DETECTION });
    const topEarly = tuplesEarly[0];
    if (!topEarly) {
      return { supported: false, detectedCode: 'und', detectedName: 'Undetermined', confidence: 0 };
    }
    const [code0, conf0] = topEarly as [string, number];
    return { supported: false, detectedCode: code0, detectedName: langName(code0), confidence: conf0 };
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
    enabledIso6393.includes(code) ||
    confidence < UNSUPPORTED_CONFIDENCE_THRESHOLD;

  return { supported, detectedCode: code, detectedName: langName(code), confidence };
}

/** Build a multi-line badge string with detected-language detail. */
export function buildUnsupportedBadge(info: LanguageSupportInfo, enabledListLabel: string): string {
  const pct = Math.round(info.confidence * 100);
  return `Unsupported language\nDetected: ${info.detectedName} (${pct}% confidence)\nEnabled: ${enabledListLabel}`;
}

/** Build a longer message for the popup / tooltip. */
export function buildUnsupportedMessage(info: LanguageSupportInfo, enabledListLabel: string): string {
  const pct = Math.round(info.confidence * 100);
  return `Language not supported. Detected ${info.detectedName} (ISO 639-3: ${info.detectedCode}) with ${pct}% confidence. Your settings allow: ${enabledListLabel}.`;
}

/**
 * True when the post looks like English, Spanish, or French (or Scots → English)
 * but the user left that language unchecked in Text detection languages.
 */
export function shouldUseUncheckedInSettingsCopy(
  detectedCode: string,
  userLanguages: readonly DetectionLanguageCode[],
): boolean {
  const canonical: DetectionLanguageCode | null =
    detectedCode === 'sco' || detectedCode === 'eng'
      ? 'eng'
      : detectedCode === 'spa'
        ? 'spa'
        : detectedCode === 'fra'
          ? 'fra'
          : null;
  if (canonical === null) return false;
  return !userLanguages.includes(canonical);
}

/** Feed badge, popup text, and hover strings for a blocked language. */
export interface LanguageUnsupportedCopy {
  badge: string;
  popupMessage: string;
  hoverSimple: string;
  hoverTooltipTitle: string;
  hoverTooltipBody: string;
}

export function getLanguageUnsupportedCopy(
  info: LanguageSupportInfo,
  enabledListLabel: string,
  userLanguages: readonly DetectionLanguageCode[],
): LanguageUnsupportedCopy {
  const pct = Math.round(info.confidence * 100);
  if (shouldUseUncheckedInSettingsCopy(info.detectedCode, userLanguages)) {
    return {
      badge:
        `Unchecked in settings\n${info.detectedName} detected (${pct}% confidence)\n` +
        `Enable it under Text detection languages.`,
      popupMessage:
        `${info.detectedName} is unchecked in settings (${pct}% confidence). ` +
        `Turn it on under Text detection languages to scan this language.`,
      hoverSimple:
        `Unchecked in settings: ${info.detectedName}. Enable under Text detection languages.`,
      hoverTooltipTitle: 'Unchecked in settings',
      hoverTooltipBody:
        `${info.detectedName} detected (${pct}% confidence). ` +
        `You turned this language off — enable it under Text detection languages.`,
    };
  }
  return {
    badge: buildUnsupportedBadge(info, enabledListLabel),
    popupMessage: buildUnsupportedMessage(info, enabledListLabel),
    hoverSimple: buildUnsupportedLanguageHover(info.detectedName),
    hoverTooltipTitle: 'Unsupported language',
    hoverTooltipBody: `${info.detectedName} detected (${pct}% confidence). Your settings only scan: ${enabledListLabel}.`,
  };
}

/**
 * Verdict tooltip line when the detected language is among **enabled** guesses.
 */
export function getTooltipLanguageLine(
  text: string,
  enabledIso6393: readonly string[],
): string | null {
  if (enabledIso6393.length === 0) return null;

  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH_FOR_DETECTION) return null;

  const cleaned = trimmed
    .replace(/#\w+/g, '')
    .replace(/@\w+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
  if (cleaned.length < MIN_TEXT_LENGTH_FOR_DETECTION) return null;

  const tuples = francAll(cleaned, { minLength: MIN_TEXT_LENGTH_FOR_DETECTION });
  const top = tuples[0];
  if (!top) return null;

  const [code] = top as [string, number];
  if (!enabledIso6393.includes(code)) return null;

  const label = code === 'sco' ? 'English' : langName(code);
  return `Language detected: ${label}`;
}

/** Hover copy for feed badge when detection is blocked for language. */
export function buildUnsupportedLanguageHover(detectedName: string): string {
  return `Unsupported language. ${detectedName} detected.`;
}

/** Two-line badge text for feed (generic fallback). */
export const UNSUPPORTED_LANGUAGE_BADGE =
  'Unsupported language\nEnglish, Spanish, and French supported';

/** Full message for popup (generic fallback). */
export const UNSUPPORTED_LANGUAGE_MESSAGE =
  `Language not supported. Currently supported: ${SUPPORTED_LANGUAGE_NAMES}.`;
