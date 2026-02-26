/**
 * Firebase initialization for the browser extension.
 *
 * Unlike the website (which fetches config from a server-side API route),
 * the extension reads config from Vite environment variables (VITE_FIREBASE_*).
 * These are embedded at build time and safe to expose in a client-side context
 * — security is enforced by Firestore rules, not by hiding the API key.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let googleProvider: GoogleAuthProvider | undefined;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Initialise Firebase (idempotent).
 * Returns immediately if already initialised.
 */
export function initFirebase(): void {
  if (auth) return; // already initialised

  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();

  // Ensure auth state persists across popup opens/closes
  setPersistence(auth, browserLocalPersistence).catch(console.error);
}

export { app, auth, db, googleProvider };
