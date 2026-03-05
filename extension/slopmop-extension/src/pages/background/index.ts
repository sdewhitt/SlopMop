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
  getIgnoredSites,
  setIgnoredSites as setIgnoredSitesFirestore,
} from '@src/lib/firestore';
import {
  setIgnoredSites,
  getIgnoredSites as getIgnoredSitesLocal,
  normalizeHost,
  validateHost,
} from '@src/utils/disabledWebsites';
import { detectText, type DetectResponse } from '@src/lib/api';
import { DEFAULT_SETTINGS, UserSettings, type DetectionResponse, NormalizedPostContent } from '@src/types/domain';

import { defaultUserSettings, type DetectionSettings } from '@src/utils/userSettings';

console.log('background script loaded');

// ── Post analysis ────────────────────────────────────────────────
// Max number of images to fetch concurrently.
const IMAGE_FETCH_CONCURRENCY = 3;
// hardcoded developer toggle. keep true for offline fake responses.
const USE_FAKE_DETECTION = false;

async function getDetectionSettings(): Promise<DetectionSettings> {
  const stored = await browser.storage.local.get('settings');
  const saved = (stored.settings ?? {}) as Partial<DetectionSettings>;
  return { ...defaultUserSettings.settings, ...saved };
}

// ── Firebase Auth ────────────────────────────────────────────────
// All Firebase Auth operations run here in the background script
// where network requests are unrestricted (no page CSP).
// The content script communicates via runtime.sendMessage.

initFirebase();

// Sync the current Firebase user to browser.storage.local so the
// content-script React tree can read auth state reactively.
if (auth) {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      browser.storage.local.set({
        slopmopUser: { uid: firebaseUser.uid, email: firebaseUser.email },
      });
      // Sync ignored sites from Firestore to local storage so the content
      // script can read them synchronously without a Firestore round-trip.
      try {
        const sites = await getIgnoredSites(firebaseUser.uid);
        await setIgnoredSites(sites);
      } catch (e) {
        console.error('[SlopMop] Failed to sync ignoredSites from Firestore', e);
      }
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
      postsScanned: 0,
      aiDetected: 0,
      settings: defaultUserSettings.settings,
    });
  }
});

// ── Message handlers ─────────────────────────────────────────────

interface BackgroundMessage {
  type: string;
  email?: string;
  password?: string;
  uid?: string;
  site?: string;
  patch?: Partial<DetectionSettings>;
  text?: string;
  payload?: NormalizedPostContent;
}

interface MessageResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

browser.runtime.onMessage.addListener((message: unknown, sender: browser.Runtime.MessageSender) => {
  if (typeof message !== 'object' || message === null) return;
  const msg = message as BackgroundMessage;

  switch (msg.type) {
    // ── Post analysis ──
    case 'ANALYZE_POST': {
      const tabId = sender.tab?.id;
      if (!tabId) return;
      handleAnalyzePost(msg.payload!, tabId);
      return true;
    }
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
    case 'SLOPMOP_DETECT':
      return handleDetect(msg.text ?? '');
    case 'SLOPMOP_GET_IGNORED_SITES':
      return handleGetIgnoredSites(msg.uid);
    case 'SLOPMOP_ADD_IGNORED_SITE':
      return handleAddIgnoredSite(msg.uid, msg.site!);
    case 'SLOPMOP_REMOVE_IGNORED_SITE':
      return handleRemoveIgnoredSite(msg.uid, msg.site!);
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

// ── Ignored Sites handlers ────────────────────────────────────────

async function handleGetIgnoredSites(uid?: string): Promise<MessageResponse> {
  try {
    // Return local storage copy — always up to date for authenticated users.
    const sites = await getIgnoredSitesLocal();
    return { success: true, data: sites };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleAddIgnoredSite(uid: string | undefined, site: string): Promise<MessageResponse> {
  try {
    const normalized = normalizeHost(site);
    const err = validateHost(normalized);
    if (err) return { success: false, error: err };

    const current = await getIgnoredSitesLocal();
    if (current.includes(normalized)) {
      return { success: false, error: 'Site is already in the list.' };
    }

    const updated = [...current, normalized];
    await setIgnoredSites(updated);

    // Persist to Firestore for authenticated users.
    if (uid) await setIgnoredSitesFirestore(uid, updated).catch(console.error);

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleRemoveIgnoredSite(uid: string | undefined, site: string): Promise<MessageResponse> {
  try {
    const current = await getIgnoredSitesLocal();
    const updated = current.filter((s) => s !== site);
    await setIgnoredSites(updated);

    // Persist to Firestore for authenticated users.
    if (uid) await setIgnoredSitesFirestore(uid, updated).catch(console.error);

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleDetect(text: string): Promise<MessageResponse> {
  try {
    const result = await detectText(text);
    await browser.storage.local.set({
      detectResponse: result,
      lastDetectResponse: result,
    });
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Post analysis handlers ──────────────────────────────────────

async function handleAnalyzePost(post: NormalizedPostContent, tabId: number): Promise<void> {
  const settings = await getDetectionSettings();
  const shouldFetchImages = settings.scanImages && post.images.length > 0;

  let enrichedImages = post.images;
  if (shouldFetchImages) {
    enrichedImages = await fetchImagesThrottled(post.images, IMAGE_FETCH_CONCURRENCY);
  } else {
    enrichedImages = post.images.map((img) => ({ ...img, bytesBase64: '' }));
  }

  const enrichedPost = { ...post, images: enrichedImages };
  const plainText = enrichedPost.text?.plain ?? '';

  if (!plainText.trim()) {
    await browser.tabs.sendMessage(tabId, {
      type: 'DETECTION_ERROR',
      payload: { postId: enrichedPost.postId, message: 'empty text' },
    });
    return;
  }

  if (USE_FAKE_DETECTION) {
    const fakeResponse = buildFakeResponse(enrichedPost);
    if (fakeResponse) {
      await browser.tabs.sendMessage(tabId, {
        type: 'DETECTION_RESULT',
        payload: fakeResponse,
      });
    } else {
      await browser.tabs.sendMessage(tabId, {
        type: 'DETECTION_ERROR',
        payload: { postId: enrichedPost.postId, message: 'fake detection returned no result' },
      });
    }
    return;
  }

  try {
    const start = performance.now();
    const apiResult = await detectText(plainText);
    const elapsedMs = Math.round(performance.now() - start);
    const mapped = mapToDetectionResponse(apiResult, enrichedPost.postId, elapsedMs);

    await browser.tabs.sendMessage(tabId, {
      type: 'DETECTION_RESULT',
      payload: mapped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network error';
    await browser.tabs.sendMessage(tabId, {
      type: 'DETECTION_ERROR',
      payload: { postId: enrichedPost.postId, message },
    });
  }
}

// Fetches bytesBase64 for images with at most `concurrency` in flight at a time.
async function fetchImagesThrottled(
  images: NormalizedPostContent['images'],
  concurrency: number,
): Promise<NormalizedPostContent['images']> {
  const results: NormalizedPostContent['images'] = [];

  for (let i = 0; i < images.length; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (img) => {
        if (img.bytesBase64) return img;
        const base64 = await fetchImageAsBase64(img.srcUrl);
        return { ...img, bytesBase64: base64 };
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

// Fetches a single image by URL and returns its contents as a base64 string.
async function fetchImageAsBase64(srcUrl: string): Promise<string> {
  try {
    const response = await fetch(srcUrl);
    if (!response.ok) return '';
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  } catch {
    return '';
  }
}


function buildFakeResponse(post: NormalizedPostContent): DetectionResponse | null {
  let fakeResponse: DetectionResponse | undefined;
  const textLen: number = post.text?.plain?.length ?? 0;
  const roll = Math.random();
  if (roll < 0.4) {
    fakeResponse = {
      requestId: 'debug-req',
      postId: post.postId,
      verdict: 'likely_ai',
      confidence: 0.92,
      explanation: {
        summary: 'Repetitive phrasing and low perplexity',
        highlights: textLen > 20 ? [
          { start: 0, end: Math.min(textLen, 45), reason: 'Opening follows a common AI template pattern' },
          { start: Math.min(Math.floor(textLen * 0.4), textLen), end: Math.min(Math.floor(textLen * 0.4) + 60, textLen), reason: 'Unusually low perplexity for this span' },
        ] : [],
        model: { name: 'debug', version: '0.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 0, inferenceMs: 0 },
      },
    };
  } else if (roll < 0.7) {
    fakeResponse = {
      requestId: 'debug-req',
      postId: post.postId,
      verdict: 'likely_human',
      confidence: 0.78,
      explanation: {
        summary: 'Natural variance and typos detected',
        highlights: textLen > 30 ? [
          { start: Math.min(10, textLen), end: Math.min(50, textLen), reason: 'Contains a natural typo / informal shorthand' },
        ] : [],
        model: { name: 'debug', version: '0.0' },
        cache: { hit: true, ttlRemainingMs: 45 },
        timing: { totalMs: 321, inferenceMs: 190 },
      },
    };
  } else if (roll < 0.9) {
    fakeResponse = {
      requestId: 'debug-req',
      postId: post.postId,
      verdict: 'unknown',
      confidence: 0.5,
      explanation: {
        summary: 'Insufficient signal',
        model: { name: 'debug', version: '0.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 0, inferenceMs: 0 },
      },
    };
  } else {
    return null;
  }
  return fakeResponse;
}

function mapToDetectionResponse(
  apiResult: DetectResponse,
  postId: string,
  timingMs: number,
): DetectionResponse {
  const verdict: DetectionResponse['verdict'] =
    apiResult.label === 'ai' ? 'likely_ai'
      : apiResult.label === 'human' ? 'likely_human'
        : 'unknown';

  return {
    requestId: crypto.randomUUID(),
    postId,
    verdict,
    confidence: apiResult.confidence,
    explanation: {
      summary: apiResult.explanation,
      highlights: [],
      model: { name: 'slopmop-api', version: '1.0' },
      cache: { hit: false, ttlRemainingMs: 0 },
      timing: { totalMs: timingMs, inferenceMs: timingMs },
    },
  };
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
