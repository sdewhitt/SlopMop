"use client";

import {
  clearOnboardingStorage,
  ONBOARDING_OPEN_EVENT,
} from "../lib/onboardingStorage";

/** Footer control: clear the “seen” flag and open the onboarding modal once. */
export default function ViewOnboardingAgainButton() {
  return (
    <button
      type="button"
      onClick={() => {
        clearOnboardingStorage();
        window.dispatchEvent(new CustomEvent(ONBOARDING_OPEN_EVENT));
      }}
      className="text-xs text-slate-500 underline-offset-2 transition hover:text-slate-700 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
    >
      View onboarding again
    </button>
  );
}
