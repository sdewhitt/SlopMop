/**
 * First-time onboarding flag for the marketing site (localStorage).
 * Scoped to this origin only.
 */
export const ONBOARDING_STORAGE_KEY = "hasSeenOnboarding";

export function readHasSeenOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

export function writeHasSeenOnboarding(seen: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (seen) {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

/** Call when user resets all settings so onboarding can show again. */
export function clearOnboardingStorage(): void {
  writeHasSeenOnboarding(false);
}
