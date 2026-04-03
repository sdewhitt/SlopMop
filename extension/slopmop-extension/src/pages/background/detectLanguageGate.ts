/**
 * Language gating for detection — shared by popup detect and feed analyze post.
 * Keeps tab/storage payloads identical to what the background sends.
 */
import type { DetectionLanguageUnsupportedPayload, PostId } from '@src/types/domain';
import type { DetectionSettings } from '@src/utils/userSettings';
import {
  expandUserDetectionLanguages,
  formatDetectionLanguagesForUi,
  getLanguageSupportInfo,
  getLanguageUnsupportedCopy,
  isTextLanguageSupported,
} from '@src/utils/languageSupport';

/**
 * Early exit for {@code handleAnalyzePost}: text-only (no fetched image bytes) and
 * franc-confident unsupported language. Matches the first guard before {@code /detect}.
 */
export function tryAnalyzePostLanguageUnsupported(
  postId: PostId,
  plainText: string,
  hasImageBytes: boolean,
  settings: DetectionSettings,
):
  | { type: 'DETECTION_LANGUAGE_UNSUPPORTED'; payload: DetectionLanguageUnsupportedPayload }
  | null {
  if (hasImageBytes) return null;
  const enabledIso = expandUserDetectionLanguages(settings.detectionLanguages);
  const enabledLabel = formatDetectionLanguagesForUi(settings.detectionLanguages);
  if (isTextLanguageSupported(plainText, enabledIso)) return null;
  const langInfo = getLanguageSupportInfo(plainText, enabledIso);
  const copy = getLanguageUnsupportedCopy(langInfo, enabledLabel, settings.detectionLanguages);
  return {
    type: 'DETECTION_LANGUAGE_UNSUPPORTED',
    payload: {
      postId,
      message: copy.badge,
      detectedLanguageName: langInfo.detectedName,
      hoverSimple: copy.hoverSimple,
      hoverTooltipTitle: copy.hoverTooltipTitle,
      hoverTooltipBody: copy.hoverTooltipBody,
    },
  };
}

export type PopupDetectLanguageBlockStorage = {
  lastDetectResponse: null;
  detectResponse: null;
  lastDetectLanguageUnsupported: { message: string };
};

/**
 * Popup manual detect: gate before {@code detectText}. Same storage keys as {@code handleDetect}.
 */
export function tryPopupDetectLanguageBlock(
  text: string,
  settings: DetectionSettings,
):
  | { blocked: true; storage: PopupDetectLanguageBlockStorage; errorMessage: string }
  | { blocked: false } {
  const enabledIso = expandUserDetectionLanguages(settings.detectionLanguages);
  const enabledLabel = formatDetectionLanguagesForUi(settings.detectionLanguages);
  if (isTextLanguageSupported(text, enabledIso)) {
    return { blocked: false };
  }
  const langInfo = getLanguageSupportInfo(text, enabledIso);
  const copy = getLanguageUnsupportedCopy(langInfo, enabledLabel, settings.detectionLanguages);
  return {
    blocked: true,
    storage: {
      lastDetectResponse: null,
      detectResponse: null,
      lastDetectLanguageUnsupported: { message: copy.popupMessage },
    },
    errorMessage: copy.popupMessage,
  };
}
