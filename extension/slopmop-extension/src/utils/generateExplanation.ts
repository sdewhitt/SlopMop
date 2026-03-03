import { type ConfidenceExplanationOptions, getConfidenceExplanation } from '@src/utils/confidenceExplanation';

export function normalizeConfidence(confidence: number | null | undefined): number | null {
  if (confidence == null) return null;
  if (Number.isNaN(confidence)) return null;

  // Accept either 0..1 or 0..100 inputs.
  const asUnit = confidence > 1 ? confidence / 100 : confidence;
  if (Number.isNaN(asUnit)) return null;

  return Math.max(0, Math.min(1, asUnit));
}

/**
 * Fallback explanation generator used when backend does not provide an explanation field.
 * Confidence can be provided as 0..1 or 0..100.
 */
export function generateExplanation(
  confidence: number | null | undefined,
  options?: ConfidenceExplanationOptions
): string {
  return getConfidenceExplanation(normalizeConfidence(confidence), options);
}

/**
 * Prefer backend-provided explanation; otherwise fall back to `generateExplanation(confidence)`.
 */
export function resolveExplanation(params: {
  explanation?: string | null | undefined;
  confidence?: number | null | undefined;
  metadataComplete?: boolean;
}): string {
  const provided = params.explanation?.trim();
  if (provided) return provided;

  return generateExplanation(params.confidence, { metadataComplete: params.metadataComplete });
}

