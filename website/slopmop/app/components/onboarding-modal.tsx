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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/70 bg-white/95 p-6 text-slate-900 shadow-lg backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90 dark:text-slate-100"
        data-onboarding-modal
      >
        <h2 id="onboarding-title" className="text-lg font-semibold leading-snug">
          Understanding SlopMop detection
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
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
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
            onClick={dismissSeen}
          >
            Close
          </button>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 dark:focus-visible:ring-offset-slate-950"
            onClick={dismissSeen}
          >
            Don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  );
}
