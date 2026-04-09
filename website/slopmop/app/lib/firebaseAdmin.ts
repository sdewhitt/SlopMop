/**
 * Firebase Admin SDK initialization (server-side only).
 *
 * Used by API routes that need admin privileges, such as generating
 * custom auth tokens for the browser extension.
 */

import {
  initializeApp,
  getApps,
  cert,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | undefined;
let adminAuth: Auth | undefined;
let adminDb: Firestore | undefined;

function serviceAccountFromEnv(): ServiceAccount | null {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountJson) {
    try {
      return JSON.parse(serviceAccountJson) as ServiceAccount;
    } catch (error) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey,
    };
  }

  return null;
}

function getOrInitApp(): App {
  if (app) return app;

  if (getApps().length === 0) {
    // Supports either:
    // 1) FIREBASE_SERVICE_ACCOUNT_KEY JSON
    // 2) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
    const serviceAccount = serviceAccountFromEnv();

    if (serviceAccount) {
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId ?? process.env.FIREBASE_PROJECT_ID,
      });
    } else {
      // Fallback to Application Default Credentials (ADC) in hosted environments.
      // This requires GOOGLE_APPLICATION_CREDENTIALS locally unless running on GCP.
      app = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }
  } else {
    app = getApps()[0];
  }

  return app;
}

export function initAdmin(): Auth {
  if (adminAuth) return adminAuth;

  adminAuth = getAuth(getOrInitApp());
  return adminAuth;
}

export function initAdminDb(): Firestore {
  if (adminDb) return adminDb;
  adminDb = getFirestore(getOrInitApp());
  return adminDb;
}
