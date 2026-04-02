"use client";

import { useEffect, useState, useCallback } from "react";
import {
  readHasSeenOnboarding,
  writeHasSeenOnboarding,
  ONBOARDING_OPEN_EVENT,
} from "../lib/onboardingStorage";

/**
 * First-time onboarding for the homepage. Minimal structure; content is placeholder.
 * Works with site dark mode (Tailwind dark:) and larger text if user zooms or uses OS accessibility settings.
 */
export default function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (!readHasSeenOnboarding()) {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(ONBOARDING_OPEN_EVENT, show);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, show);
  }, []);

  const dismissSeen = useCallback(() => {
    writeHasSeenOnboarding(true);
    setOpen(false);
  }, []);

  if (!hydrated || !open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="presentation"
      data-onboarding-backdrop
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-neutral-300 bg-white p-6 text-neutral-900 shadow-lg dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
        data-onboarding-modal
      >
        <h2 id="onboarding-title" className="text-lg font-semibold leading-snug">
          Understanding SlopMop detection
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <p>
            <strong>Detection badge:</strong> When the extension analyzes a post, it shows a
            result (for example, likely AI-generated or likely human-written). The badge is a
            quick summary, not a guarantee.
          </p>
          <p>
            <strong>Confidence score:</strong> Percentages reflect how strongly the model leans
            one way or another. They are <strong>probabilistic</strong>—higher means more
            confidence in that label, not proof.
          </p>
          <p>
            <strong>Explanation text:</strong> Short notes may highlight patterns or context.
            Use them together with the score; they help you interpret, not replace your own
            judgment.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-neutral-500 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={dismissSeen}
          >
            Close
          </button>
          <button
            type="button"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
            onClick={dismissSeen}
          >
            Don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  );
}
