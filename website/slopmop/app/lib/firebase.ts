import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let googleProvider: GoogleAuthProvider | undefined;
let initPromise: Promise<void> | null = null;

/**
 * Fetches Firebase config from the server-side API route and initializes
 * the Firebase app. This avoids exposing API keys via NEXT_PUBLIC_ env vars.
 * Returns a promise that resolves once Firebase is ready.
 */
export function initFirebase(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  // If already initialized, resolve immediately
  if (auth) {
    return Promise.resolve();
  }

  // Deduplicate concurrent calls
  if (initPromise) {
    return initPromise;
  }

  initPromise = fetch("/api/firebase-config")
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch Firebase config");
      return res.json();
    })
    .then((config) => {
      app =
        getApps().length === 0 ? initializeApp(config) : getApps()[0];
      auth = getAuth(app);
      googleProvider = new GoogleAuthProvider();
    })
    .catch((err) => {
      initPromise = null; // allow retry on failure
      throw err;
    });

  return initPromise;
}

export { auth, googleProvider };
