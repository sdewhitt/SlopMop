import React from 'react';
import { getConfidenceExplanation } from '@src/utils/confidenceExplanation';

interface ConfidenceDisplayProps {
  confidenceScore: number;
}

export default function ConfidenceDisplay({ confidenceScore }: ConfidenceDisplayProps) {
  const explanation = getConfidenceExplanation(confidenceScore);

  return (
    <section className="mt-4 text-left">
      <p className="text-sm font-medium text-gray-200">
        Confidence: {Math.round(confidenceScore * 100)}%
      </p>
      <p className="confidence-explanation mt-1.5 text-xs text-gray-400 leading-snug">
        {explanation}
      </p>
    </section>
  );
}
