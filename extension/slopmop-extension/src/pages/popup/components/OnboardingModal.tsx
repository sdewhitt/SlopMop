import React, { useState } from 'react';

interface OnboardingModalProps {
  onClose: () => void;
  onDontShowAgain: () => void;
  simpleMode: boolean;
  accessibilityMode: boolean;
}

const STEPS = [
  {
    title: 'Welcome to SlopMop',
    body: (
      <>
        <p>
          SlopMop detects AI-generated content as you browse social media feeds — no manual effort
          needed.
        </p>
        <p className="mt-2">
          Each post gets a <strong>detection badge</strong> showing whether it looks AI-generated or
          human-written, along with a confidence score and a short explanation of why.
        </p>
      </>
    ),
  },
  {
    title: 'Reading Results',
    body: (
      <>
        <p>
          <strong>Badge:</strong> "Likely AI" or "Likely Human" — a quick label based on the
          model's analysis.
        </p>
        <p className="mt-2">
          <strong>Confidence %:</strong> How certain the model is (0–100%). Higher = more
          confident, not definitive.
        </p>
        <p className="mt-2">
          <strong>Explanation:</strong> A short reason for the verdict — hover or tap the badge to
          see it.
        </p>
      </>
    ),
  },
  {
    title: 'Get Started',
    body: (
      <>
        <p>
          Head to <strong>X, Reddit, LinkedIn</strong>, or <strong>Instagram</strong> and start
          scrolling — SlopMop will label posts automatically.
        </p>
        <p className="mt-2">
          Visit <strong>Settings</strong> to choose platforms or switch to Simple Mode for a
          cleaner view.
        </p>
        <p className="mt-2 text-gray-500 dark:text-gray-400 text-[10px]">
          Your data and preferences are private to your account and never shared with other users.
        </p>
      </>
    ),
  },
];

export default function OnboardingModal({
  onClose,
  onDontShowAgain,
  simpleMode,
  accessibilityMode,
}: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const { title, body } = STEPS[step];

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
        {/* Step indicator */}
        <div className="flex gap-1 mb-3">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step
                  ? 'bg-blue-600'
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        <h2 id="onboarding-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h2>

        <div className="mt-2 space-y-0 text-xs leading-snug text-gray-700 dark:text-gray-300">
          {body}
        </div>

        <div className="mt-4 flex justify-between items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-3 py-1.5 rounded border border-gray-300 text-xs text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Back
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={onDontShowAgain}
                className="px-3 py-1.5 rounded bg-blue-600 text-xs text-white hover:bg-blue-700"
              >
                Got it
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="px-3 py-1.5 rounded bg-blue-600 text-xs text-white hover:bg-blue-700"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
