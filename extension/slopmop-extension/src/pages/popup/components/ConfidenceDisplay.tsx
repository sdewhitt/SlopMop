import React from 'react';
import { getConfidenceExplanation } from '@src/utils/confidenceExplanation';
import type { Verdict } from '@src/types/domain';

interface ConfidenceDisplayProps {
  confidenceScore: number;
  /** When true, show "Likely AI" / "Likely Human" with large text and icons instead of percentage. */
  simpleMode?: boolean;
  /** Verdict from detection; used in simple mode for label. */
  verdict?: Verdict;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  likely_ai: 'Likely AI',
  likely_human: 'Likely Human',
  unknown: 'Inconclusive',
};

/** Icon: robot/sparkles for AI (orange). */
function LikelyAIIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 8V4H8" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <path d="M6 18v-4M10 18v-4M14 18v-4M18 18v-4" />
      <path d="M9 10h.01M15 10h.01" />
    </svg>
  );
}

/** Icon: person for human (green). */
function LikelyHumanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

export default function ConfidenceDisplay({ confidenceScore, simpleMode, verdict }: ConfidenceDisplayProps) {
  const explanation = getConfidenceExplanation(confidenceScore);
  const pct = Math.round(confidenceScore * 100);
  const barColor = pct >= 70 ? 'bg-red-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-green-500';

  if (simpleMode) {
    const v = verdict ?? (pct >= 60 ? 'likely_ai' : pct >= 40 ? 'unknown' : 'likely_human');
    const label = VERDICT_LABEL[v];
    const isAI = v === 'likely_ai';
    const isHuman = v === 'likely_human';
    return (
      <section className="mt-4 text-left">
        <div
          className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
            isAI ? 'bg-amber-500/20 border border-amber-500/50 text-amber-200' : ''
          } ${isHuman ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-200' : ''} ${
            v === 'unknown' ? 'bg-gray-600/30 border border-gray-500/50 text-gray-300' : ''
          }`}
        >
          <span className="shrink-0 w-10 h-10 flex items-center justify-center" aria-hidden>
            {isAI && <LikelyAIIcon className="w-8 h-8 text-amber-400" />}
            {isHuman && <LikelyHumanIcon className="w-8 h-8 text-emerald-400" />}
            {v === 'unknown' && (
              <span className="text-2xl text-gray-400" aria-hidden>?</span>
            )}
          </span>
          <p className="text-lg font-semibold leading-tight">{label}</p>
        </div>
        <p className="confidence-explanation mt-2 text-xs text-gray-400 leading-snug">
          {explanation}
        </p>
      </section>
    );
  }

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
