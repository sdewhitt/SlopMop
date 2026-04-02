import React from 'react';

interface OnboardingModalProps {
  onClose: () => void;
  onDontShowAgain: () => void;
  simpleMode: boolean;
  accessibilityMode: boolean;
}

export default function OnboardingModal({
  onClose,
  onDontShowAgain,
  simpleMode,
  accessibilityMode,
}: OnboardingModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className={`w-full max-w-[320px] rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white p-4 shadow-xl ${
          simpleMode ? 'simple-mode' : ''
        } ${accessibilityMode ? 'accessibility-mode' : ''}`}
      >
        <h2 id="onboarding-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Welcome to SlopMop
        </h2>
        <div className="mt-3 space-y-2 text-xs leading-snug text-gray-700 dark:text-gray-300">
          <p>
            <strong>Detection badge:</strong> A quick label that indicates whether content looks likely AI-generated or likely human-written.
          </p>
          <p>
            <strong>Confidence score:</strong> A probability estimate from 0-100%. Higher confidence means the model is more certain, not definitive.
          </p>
          <p>
            <strong>Explanation text:</strong> Short reasoning that helps you understand why the system produced the result.
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-gray-300 text-xs text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onDontShowAgain}
            className="px-3 py-1.5 rounded bg-blue-600 text-xs text-white hover:bg-blue-700"
          >
            Don&apos;t show again
          </button>
        </div>
      </section>
    </div>
  );
}
