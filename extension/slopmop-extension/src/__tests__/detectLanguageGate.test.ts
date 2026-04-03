import { describe, expect, it } from 'vitest';
import {
  tryAnalyzePostLanguageUnsupported,
  tryPopupDetectLanguageBlock,
} from '@src/pages/background/detectLanguageGate';
import { defaultUserSettings } from '@src/utils/userSettings';
import type { DetectionSettings } from '@src/utils/userSettings';

const SPANISH_POST_BODY =
  'Hola a todos. Este es un texto completamente en español para probar la detección de idioma. ' +
  'Esperamos que funcione correctamente con suficientes caracteres para el modelo.';

function settingsWithLanguages(langs: DetectionSettings['detectionLanguages']): DetectionSettings {
  return { ...defaultUserSettings.settings, detectionLanguages: langs };
}

/**
 * Exercises the same helpers used by background/index.ts 
 * (handleAnalyzePost early exit + handleDetect storage gate) 
 * so skipping POST /detect and badge/popup copy stay in sync.
 */
describe('detectLanguageGate', () => {
  it('analyze post: text-only, high-confidence unsupported language → tab message; blocks before /detect', () => {
    const msg = tryAnalyzePostLanguageUnsupported(
      'post-1',
      SPANISH_POST_BODY,
      false,
      settingsWithLanguages(['eng']),
    );
    expect(msg).not.toBeNull();
    expect(msg?.type).toBe('DETECTION_LANGUAGE_UNSUPPORTED');
    expect(msg?.payload.postId).toBe('post-1');
    expect(msg?.payload.message).toContain('Spanish');
    expect(msg?.payload.detectedCode).toBe('spa');
    expect(msg?.payload.confidence).toBeGreaterThanOrEqual(0.85);
    expect(msg?.payload.detectedLanguageName).toBe('Spanish');
    expect(msg?.payload.hoverTooltipTitle.length).toBeGreaterThan(0);
  });

  it('analyze post: same body, English+Spanish enabled → no gate (background continues to detection)', () => {
    expect(
      tryAnalyzePostLanguageUnsupported(
        'post-1',
        SPANISH_POST_BODY,
        false,
        settingsWithLanguages(['eng', 'spa']),
      ),
    ).toBeNull();
  });

  it('analyze post: English-only but post has image bytes → no early language exit', () => {
    expect(
      tryAnalyzePostLanguageUnsupported(
        'post-1',
        SPANISH_POST_BODY,
        true,
        settingsWithLanguages(['eng']),
      ),
    ).toBeNull();
  });

  it('popup detect: English-only blocks with storage shape; English+Spanish allows', () => {
    const gated = tryPopupDetectLanguageBlock(SPANISH_POST_BODY, settingsWithLanguages(['eng']));
    expect(gated.blocked).toBe(true);
    if (gated.blocked) {
      expect(gated.storage.lastDetectResponse).toBeNull();
      expect(gated.storage.detectResponse).toBeNull();
      expect(gated.storage.lastDetectLanguageUnsupported.message.length).toBeGreaterThan(20);
      expect(gated.errorMessage).toBe(gated.storage.lastDetectLanguageUnsupported.message);
    }

    const allowed = tryPopupDetectLanguageBlock(SPANISH_POST_BODY, settingsWithLanguages(['eng', 'spa']));
    expect(allowed.blocked).toBe(false);
  });
});
