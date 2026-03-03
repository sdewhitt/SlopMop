/**
 * Firebase Admin SDK initialization (server-side only).
 *
 * Used by API routes that need admin privileges, such as generating
 * custom auth tokens for the browser extension.
 */

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let app: App | undefined;
let adminAuth: Auth | undefined;

export function initAdmin(): Auth {
  if (adminAuth) return adminAuth;

  if (getApps().length === 0) {
    // Expects a service account JSON string in FIREBASE_SERVICE_ACCOUNT_KEY env var,
    // or individual env vars for credentials.
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccount) {
      const parsed = JSON.parse(serviceAccount);
      app = initializeApp({
        credential: cert(parsed),
      });
    } else {
      // Fallback: initialise with project ID only (works in some hosted environments)
      app = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }
  } else {
    app = getApps()[0];
  }

  adminAuth = getAuth(app);
  return adminAuth;
}
