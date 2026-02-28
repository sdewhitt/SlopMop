import browser from 'webextension-polyfill';
import { initFirebase, auth } from '@src/lib/firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import {
  getOrCreateUserSettings,
  updateDetectionSettings,
  resetStats,
  resetSettings,
} from '@src/lib/firestore';
import type { DetectionSettings } from '@src/utils/userSettings';

console.log('background script loaded');

// ── Firebase Auth ────────────────────────────────────────────────
// All Firebase Auth operations run here in the background script
// where network requests are unrestricted (no page CSP).
// The content script communicates via runtime.sendMessage.

initFirebase();

// Sync the current Firebase user to browser.storage.local so the
// content-script React tree can read auth state reactively.
if (auth) {
  onAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      browser.storage.local.set({
        slopmopUser: { uid: firebaseUser.uid, email: firebaseUser.email },
      });
    } else {
      browser.storage.local.remove('slopmopUser');
    }
  });
}

// Disable the default popup so that action.onClicked fires.
// The popup page is kept in the manifest only so CRXJS bundles it;
// it's actually rendered by the content script directly in the page DOM.
browser.action.setPopup({ popup: '' });

// Initialize default settings on install
browser.runtime.onInstalled.addListener(async () => {
  const result = await browser.storage.local.get('settings');
  if (!result.settings) {
    await browser.storage.local.set({
      enabled: true,
      postsScanned: 0,
      aiDetected: 0,
      settings: {
        enabled: true,
        sensitivity: 'medium',
        highlightStyle: 'badge',
        platforms: {
          twitter: true,
          reddit: true,
          facebook: true,
          youtube: true,
          linkedin: true,
        },
        showNotifications: true,
        accessibilityMode: false,
      },
    });
  }
});

// ── Message handlers ─────────────────────────────────────────────

interface BackgroundMessage {
  type: string;
  email?: string;
  password?: string;
  uid?: string;
  patch?: Partial<DetectionSettings>;
}

interface MessageResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message !== 'object' || message === null) return;
  const msg = message as BackgroundMessage;

  switch (msg.type) {
    // ── Auth ──
    case 'SLOPMOP_LOGIN':
      return handleLogin(msg.email!, msg.password!);
    case 'SLOPMOP_SIGNUP':
      return handleSignup(msg.email!, msg.password!);
    case 'SLOPMOP_GOOGLE_AUTH':
      return handleGoogleAuth();
    case 'SLOPMOP_LOGOUT':
      return handleLogout();
    // ── Firestore ──
    case 'SLOPMOP_GET_SETTINGS':
      return handleGetSettings(msg.uid!);
    case 'SLOPMOP_UPDATE_DETECTION_SETTINGS':
      return handleUpdateDetectionSettings(msg.uid!, msg.patch!);
    case 'SLOPMOP_RESET_STATS':
      return handleResetStats(msg.uid!);
    case 'SLOPMOP_RESET_SETTINGS':
      return handleResetSettings(msg.uid!);
    default:
      return;
  }
});

async function handleLogin(email: string, password: string): Promise<MessageResponse> {
  try {
    if (!auth) throw new Error('Firebase not initialized');
    await signInWithEmailAndPassword(auth, email, password);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleSignup(email: string, password: string): Promise<MessageResponse> {
  try {
    if (!auth) throw new Error('Firebase not initialized');
    await createUserWithEmailAndPassword(auth, email, password);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleGoogleAuth(): Promise<MessageResponse> {
  try {
    if (!auth) throw new Error('Firebase not initialized');

    const clientId = import.meta.env.VITE_FIREBASE_OAUTH_CLIENT_ID as string;
    if (!clientId) {
      throw new Error(
        'Google sign-in not configured. Add VITE_FIREBASE_OAUTH_CLIENT_ID to .env',
      );
    }

    const redirectUrl = browser.identity.getRedirectURL();
    const scopes = ['openid', 'email', 'profile'];
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'id_token');
    authUrl.searchParams.set('redirect_uri', redirectUrl);
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('nonce', Math.random().toString(36).substring(2));

    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    const url = new URL(responseUrl);
    const params = new URLSearchParams(url.hash.substring(1));
    const idToken = params.get('id_token');
    if (!idToken) {
      throw new Error('No ID token returned from Google');
    }

    // Sign in to Firebase with the Google credential — all in background context
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleLogout(): Promise<MessageResponse> {
  try {
    if (!auth) throw new Error('Firebase not initialized');
    await signOut(auth);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Firestore handlers ───────────────────────────────────────────

async function handleGetSettings(uid: string): Promise<MessageResponse> {
  try {
    const data = await getOrCreateUserSettings(uid);
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleUpdateDetectionSettings(
  uid: string,
  patch: Partial<DetectionSettings>,
): Promise<MessageResponse> {
  try {
    await updateDetectionSettings(uid, patch);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleResetStats(uid: string): Promise<MessageResponse> {
  try {
    await resetStats(uid);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleResetSettings(uid: string): Promise<MessageResponse> {
  try {
    await resetSettings(uid);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * When the extension icon is clicked, send a toggle message to the content
 * script in the active tab. If the content script isn't available (e.g. on
 * chrome:// or about: pages), fall back to opening the popup in a new tab.
 */
browser.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await browser.tabs.sendMessage(tab.id, { type: 'SLOPMOP_TOGGLE_PANEL' });
  } catch {
    // Content script not available on this page — open as a standalone tab
    const popupUrl = browser.runtime.getURL('src/pages/popup/index.html');
    await browser.tabs.create({ url: popupUrl });
  }
});
