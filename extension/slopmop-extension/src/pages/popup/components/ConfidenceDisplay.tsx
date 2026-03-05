import React from 'react';
import { getConfidenceExplanation } from '@src/utils/confidenceExplanation';

interface ConfidenceDisplayProps {
  confidenceScore: number;
}

export default function ConfidenceDisplay({ confidenceScore }: ConfidenceDisplayProps) {
  const explanation = getConfidenceExplanation(confidenceScore);
  const pct = Math.round(confidenceScore * 100);
  const barColor = pct >= 70 ? 'bg-red-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <section className="mt-4 text-left">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-medium text-gray-200">Confidence</p>
        <p className="text-sm font-semibold text-gray-200">{pct}%</p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="confidence-explanation text-xs text-gray-400 leading-snug">
        {explanation}
      </p>
    </section>
  );
}
