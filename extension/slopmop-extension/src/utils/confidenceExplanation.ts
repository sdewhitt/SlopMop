export interface ConfidenceExplanationOptions {
  /** When true, indicates detection metadata is missing or partial; explanation will reflect limited reliability. */
  metadataComplete?: boolean;
}

export function getConfidenceExplanation(
  score: number | null | undefined,
  options?: ConfidenceExplanationOptions
): string {
  const metadataComplete = options?.metadataComplete !== false;

  if (score == null || !metadataComplete) {
    return (
      "Detection data is incomplete or unavailable. " +
      "This result may not be reliable and should be interpreted with caution. " +
      "Consider running detection again or using additional context before drawing conclusions."
    );
  }

  const clamped = Math.max(0, Math.min(1, score));

  if (clamped < 0.4) {
    return (
      "This result is inconclusive; the system has low confidence in either outcome. " +
      "Treat it as informational only, not as a definitive determination. " +
      "Additional context or human judgment is recommended when accuracy matters."
    );
  }

  if (clamped < 0.7) {
    return (
      "This result falls in a mid-range where a definitive conclusion cannot be stated with confidence. " +
      "Some indicators associated with AI-generated text were observed, but confidence is limited. " +
      "Use this as one factor among others rather than as a sole basis for decision-making."
    );
  }

  return (
    "The system attributes moderate to high confidence that this content may be AI-generated, " +
    "based on patterns commonly associated with such text. " +
    "This remains an estimate, not a certainty; consider it alongside other evidence and judgment."
  );
}
