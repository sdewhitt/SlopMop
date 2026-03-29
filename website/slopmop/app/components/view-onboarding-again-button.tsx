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
      className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-700 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200"
    >
      View onboarding again
    </button>
  );
}
