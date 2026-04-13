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
  updateDetectionStats,
  resetStats,
  resetSettings,
  getIgnoredSites,
  setIgnoredSites as setIgnoredSitesFirestore,
} from '@src/lib/firestore';
import {
  detectImage,
  detectText,
  factCheckText,
  FactCheckApiError,
  type DetectImageResponse,
  type DetectResponse,
} from '@src/lib/api';
import {
  isTextLanguageSupported,
  getLanguageSupportInfo,
  expandUserDetectionLanguages,
  formatDetectionLanguagesForUi,
  getLanguageUnsupportedCopy,
  UNSUPPORTED_LANGUAGE_MESSAGE,
  UNSUPPORTED_LANGUAGE_BADGE,
} from '@src/utils/languageSupport';
import {
  tryAnalyzePostLanguageUnsupported,
  tryPopupDetectLanguageBlock,
} from '@src/pages/background/detectLanguageGate';
import type {
  DetectionResponse,
  HighlightSpan,
  ImageDetectionResult,
  MediaType,
  NormalizedPostContent,
} from '@src/types/domain';
import {
  defaultUserSettings,
  mergeDetectionSettingsFromStored,
  normalizeDetectionLanguages,
  type DetectionSettings,
} from '@src/utils/userSettings';
import {
  getIgnoredSites as getIgnoredSitesLocal,
  setIgnoredSites,
  normalizeHost,
  validateHost,
} from '@src/utils/disabledWebsites';
import {
  applyBatteryThrottleToSettings,
  applyLowBatteryModeToSettings,
  BATTERY_THROTTLE_ACTIVE_KEY,
  BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY,
} from '@src/utils/batteryThrottle';
import {
  buildHistoryEntry,
  saveHistoryEntry,
  getHistory,
  clearHistory,
  togglePin,
  findMatchingHistoryEntry,
  findMatchingHistoryByFingerprint,
  explanationHighlightsFromSpans,
  type HistoryEntry,
} from '@src/utils/detectionHistory';
import { computePostContentFingerprint } from '@src/utils/postContentFingerprint';
import { fnv1a32Hex } from '@src/utils/fnv1aHash';
import { initBatteryThrottleController } from '@src/pages/background/batteryThrottleController';
import { formatDetectionFetchError } from '@src/utils/detectionFetchErrors';

console.log('background script loaded');

// ── Post analysis ────────────────────────────────────────────────
// Max number of images to fetch concurrently.
const IMAGE_FETCH_CONCURRENCY = 3;
// hardcoded developer toggle. keep true for offline fake responses.
const USE_FAKE_DETECTION = false;
const STATS_STORAGE_KEYS = ['postsScanned', 'aiDetected', 'postsProcessing'];
type StoredStats = {
  postsScanned: number;
  aiDetected: number;
  postsProcessing: number;
};

let statsWriteChain: Promise<void> = Promise.resolve();

async function getDetectionSettings(): Promise<DetectionSettings> {
  const stored = await browser.storage.local.get([
    'settings',
    BATTERY_THROTTLE_ACTIVE_KEY,
    BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY,
  ]);
  const base = mergeDetectionSettingsFromStored(stored.settings);
  const throttleOn = stored[BATTERY_THROTTLE_ACTIVE_KEY] === true;
  const autoLowBatteryOn = stored[BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY] === true;
  const withLowBattery = applyLowBatteryModeToSettings(base, base.lowBatteryMode || autoLowBatteryOn);
  return applyBatteryThrottleToSettings(withLowBattery, throttleOn);
}

function normalizeStoredStats(stored: Record<string, unknown>): StoredStats {
  return {
    postsScanned: typeof stored.postsScanned === 'number' ? stored.postsScanned : 0,
    aiDetected: typeof stored.aiDetected === 'number' ? stored.aiDetected : 0,
    postsProcessing: typeof stored.postsProcessing === 'number' ? stored.postsProcessing : 0,
  };
}

async function readStoredStats(): Promise<StoredStats> {
  const stored = await browser.storage.local.get(STATS_STORAGE_KEYS);
  return normalizeStoredStats(stored);
}

async function persistStats(stats: StoredStats): Promise<void> {
  await browser.storage.local.set(stats);
  const uid = auth?.currentUser?.uid;
  if (!uid) return;

  try {
    await updateDetectionStats(uid, stats);
  } catch (error) {
    console.error('[SlopMop] Failed to sync detection stats', error);
  }
}

function queueStatsUpdate(mutator: (stats: StoredStats) => StoredStats): Promise<void> {
  const next = statsWriteChain.then(async () => {
    const current = await readStoredStats();
    const updated = mutator(current);
    await persistStats(updated);
  });

  statsWriteChain = next.catch((error) => {
    console.error('[SlopMop] Failed to update detection stats', error);
  });

  return next;
}

async function markScanStarted(): Promise<void> {
  await queueStatsUpdate((stats) => ({
    postsScanned: stats.postsScanned + 1,
    aiDetected: stats.aiDetected,
    postsProcessing: stats.postsProcessing + 1,
  })).catch((error) => {
    console.error('[SlopMop] Failed to mark scan started', error);
  });
}

async function markScanFinished(aiDetected: boolean): Promise<void> {
  await queueStatsUpdate((stats) => ({
    postsScanned: stats.postsScanned,
    aiDetected: stats.aiDetected + (aiDetected ? 1 : 0),
    postsProcessing: Math.max(0, stats.postsProcessing - 1),
  })).catch((error) => {
    console.error('[SlopMop] Failed to mark scan finished', error);
  });
}

async function initializeLocalStats(): Promise<void> {
  const current = await readStoredStats();
  const next: StoredStats = {
    postsScanned: current.postsScanned,
    aiDetected: current.aiDetected,
    // In-flight scans cannot survive a background-script restart.
    postsProcessing: 0,
  };

  if (
    current.postsScanned !== next.postsScanned ||
    current.aiDetected !== next.aiDetected ||
    current.postsProcessing !== next.postsProcessing
  ) {
    await persistStats(next);
  }
}

// Backend text length limit (must match backend MAX_TEXT_LENGTH).
const MAX_TEXT_LENGTH = 5000;

// Serialise API calls so we don't overwhelm the backend.
const analysisQueue: Array<() => Promise<void>> = [];
let analysisRunning = false;

function enqueueAnalysis(task: () => Promise<void>): void {
  analysisQueue.push(task);
  drainAnalysisQueue();
}

async function drainAnalysisQueue(): Promise<void> {
  if (analysisRunning) return;
  analysisRunning = true;
  while (analysisQueue.length > 0) {
    const next = analysisQueue.shift()!;
    await next();
  }
  analysisRunning = false;
}

// ── Firebase Auth ────────────────────────────────────────────────
// All Firebase Auth operations run here in the background script
// where network requests are unrestricted (no page CSP).
// The content script communicates via runtime.sendMessage.

initFirebase();

void initBatteryThrottleController().catch((err) => {
  console.error('[SlopMop] Battery throttle controller failed to start', err);
});

// Sync the current Firebase user to browser.storage.local so the
// content-script React tree can read auth state reactively.
if (auth) {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      browser.storage.local.set({
        slopmopUser: { uid: firebaseUser.uid, email: firebaseUser.email },
      });
      try {
        const stats = await readStoredStats();
        await updateDetectionStats(firebaseUser.uid, stats);
      } catch (e) {
        console.error('[SlopMop] Failed to sync local stats to Firestore', e);
      }
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

initializeLocalStats().catch((error) => {
  console.error('[SlopMop] Failed to initialize detection stats', error);
});

// Initialize default settings on install
browser.runtime.onInstalled.addListener(async () => {
  const result = await browser.storage.local.get(['settings', ...STATS_STORAGE_KEYS]);
  if (!result.settings) {
    await browser.storage.local.set({
      postsScanned: typeof result.postsScanned === 'number' ? result.postsScanned : 0,
      aiDetected: typeof result.aiDetected === 'number' ? result.aiDetected : 0,
      postsProcessing: typeof result.postsProcessing === 'number' ? result.postsProcessing : 0,
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
  url?: string;
  payload?: NormalizedPostContent;
  postId?: string;
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
    case 'SLOPMOP_FACT_CHECK': {
      const tabId = sender.tab?.id;
      if (!tabId) {
        return Promise.resolve({ success: false, error: 'No active tab.' });
      }
      return handleFactCheck(msg.text ?? '', msg.postId ?? '', tabId);
    }
    case 'SLOPMOP_GET_IGNORED_SITES':
      return handleGetIgnoredSites(msg.uid);
    case 'SLOPMOP_ADD_IGNORED_SITE':
      return handleAddIgnoredSite(msg.uid, msg.site!);
    case 'SLOPMOP_REMOVE_IGNORED_SITE':
      return handleRemoveIgnoredSite(msg.uid, msg.site!);
    // ── History ──
    case 'SLOPMOP_GET_HISTORY':
      return handleGetHistory();
    case 'SLOPMOP_CLEAR_HISTORY':
      return handleClearHistory();
    case 'SLOPMOP_TOGGLE_PIN':
      return handleTogglePin(msg.postId!);
    case 'SLOPMOP_OPEN_URL': {
      const url = msg.url as string;
      if (!url) return;
      const targetHost = new URL(url).hostname;
      browser.tabs.query({ url: `*://${targetHost}/*` }).then((matchingTabs) => {
        if (matchingTabs.length > 0 && matchingTabs[0].id) {
          browser.tabs.update(matchingTabs[0].id, { url, active: true });
        } else {
          browser.tabs.create({ url });
        }
      });
      return;
    }
    case 'SLOPMOP_SCAN_ENTIRE_PAGE': {
      const tabId = sender.tab?.id;
      if (!tabId) return;
      browser.tabs.sendMessage(tabId, { type: 'SLOPMOP_SCAN_ENTIRE_PAGE' }).catch(() => {
        // Content script may not be available (e.g. standalone popup tab)
      });
      return true;
    }
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

// ── History handlers ──────────────────────────────────────────────

async function handleGetHistory(): Promise<MessageResponse> {
  try {
    const entries = await getHistory();
    return { success: true, data: entries };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleClearHistory(): Promise<MessageResponse> {
  try {
    await clearHistory();
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleTogglePin(postId: string): Promise<MessageResponse> {
  try {
    await togglePin(postId);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleDetect(text: string): Promise<MessageResponse> {
  const popupSettings = await getDetectionSettings();
  const gate = tryPopupDetectLanguageBlock(text, popupSettings);
  if (gate.blocked) {
    await browser.storage.local.set(gate.storage);
    return { success: false, error: gate.errorMessage };
  }
  await browser.storage.local.remove('lastDetectLanguageUnsupported');
  try {
    const result = await detectText(text, popupSettings.highlightSegments);
    await browser.storage.local.set({
      detectResponse: result,
      lastDetectResponse: result,
    });
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Fact-check does not use the same language gate as AI detection so any post text can be checked.
 * Results are pushed to the tab + storage for the popup panel.
 */
async function handleFactCheck(
  text: string,
  postId: string,
  tabId: number,
): Promise<MessageResponse> {
  try {
    const { items } = await factCheckText(text);
    await browser.storage.local.set({
      lastFactCheckResult: { postId, items, updatedAtMs: Date.now() },
      lastFactCheckError: null,
    });
    await browser.tabs
      .sendMessage(tabId, {
        type: 'FACT_CHECK_RESULT',
        payload: { postId, items },
      })
      .catch(() => {});
    return { success: true, data: { items } };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Fact check failed.';
    const code =
      err instanceof FactCheckApiError && err.status === 429 ? 'rate_limit' : 'error';
    await browser.storage.local.set({
      lastFactCheckResult: null,
      lastFactCheckError: { postId, message, code, updatedAtMs: Date.now() },
    });
    await browser.tabs
      .sendMessage(tabId, {
        type: 'FACT_CHECK_ERROR',
        payload: { postId, message, code },
      })
      .catch(() => {});
    return { success: false, error: message };
  }
}

// ── Post analysis handlers ──────────────────────────────────────

/**
 * Saves a successful detection result to history, guarded by incognito check.
 * Failures are swallowed — history is best-effort and must never affect detection.
 */
async function maybeSaveToHistory(
  post: NormalizedPostContent,
  response: DetectionResponse,
  tabId: number,
): Promise<void> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.incognito) return;
    const contentFingerprint = computePostContentFingerprint(post);
    const entry = buildHistoryEntry(
      post.postId,
      post.url,
      post.site,
      post.text?.plain ?? '',
      response.confidence,
      response.verdict,
      post.domContext?.authorHandle ?? '',
      contentFingerprint,
      {
        textExplanationSummary: response.explanation.summary,
        textHighlightedSpans: response.explanation.highlightedSpans,
        imageResult: response.imageResult,
        detectionSource: response.detectionSource,
      },
    );
    await saveHistoryEntry(entry);
  } catch (err) {
    console.error('[SlopMop] Failed to save history entry', err);
  }
}

/**
 * If history has the same platform, author handle, and text snippet as a prior detection,
 * resend that verdict without calling the API (no stats / queue impact).
 */
async function tryReplayFromHistory(post: NormalizedPostContent, tabId: number): Promise<boolean> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.incognito) return false;

    const plainText = post.text?.plain ?? '';
    if (post.contentType === 'IMAGE' && !plainText.trim()) return false;

    const entries = await getHistory();
    const match = findMatchingHistoryEntry(
      entries,
      post.site,
      post.domContext?.authorHandle ?? '',
      plainText,
    );
    if (!match) return false;

    const payload = buildDetectionResponseFromHistory(match, post.postId, { fingerprint: false });
    await browser.tabs.sendMessage(tabId, {
      type: 'DETECTION_RESULT',
      payload,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * After media is resolved: replay if content fingerprint matches a prior run (reposts / stolen posts).
 */
async function tryReplayFromHistoryByFingerprint(
  post: NormalizedPostContent,
  tabId: number,
): Promise<HistoryEntry | null> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.incognito) return null;

    const fp = computePostContentFingerprint(post);
    const entries = await getHistory();
    const match = findMatchingHistoryByFingerprint(entries, post.site, fp);
    if (!match) return null;

    const payload = buildDetectionResponseFromHistory(match, post.postId, { fingerprint: true });
    await browser.tabs.sendMessage(tabId, {
      type: 'DETECTION_RESULT',
      payload,
    });
    return match;
  } catch {
    return null;
  }
}

function buildDetectionResponseFromHistory(
  entry: HistoryEntry,
  currentPostId: string,
  opts?: { fingerprint?: boolean },
): DetectionResponse {
  const viaFingerprint = opts?.fingerprint === true;
  const summaryFallback = viaFingerprint
    ? 'Same content fingerprint as a recent detection in your history — showing the saved result.'
    : 'Same author and text as a recent detection in your history — showing the saved result.';
  const hasStoredSummary = Boolean(entry.textExplanationSummary?.trim());
  const spans = entry.textHighlightedSpans ?? [];
  const highlights =
    spans.length > 0 ? explanationHighlightsFromSpans(spans) : undefined;

  return {
    requestId: `history-replay-${entry.savedAtMs}-${currentPostId}`,
    postId: currentPostId,
    verdict: entry.verdict,
    confidence: entry.confidence,
    detectionSource: entry.detectionSource ?? 'text',
    explanation: {
      summary: hasStoredSummary ? entry.textExplanationSummary! : summaryFallback,
      ...(highlights ? { highlights } : {}),
      ...(spans.length > 0 ? { highlightedSpans: spans } : {}),
      model: { name: 'history', version: '1' },
      cache: { hit: true, ttlRemainingMs: 0 },
      timing: { totalMs: 0, inferenceMs: 0 },
    },
    ...(entry.imageResult ? { imageResult: entry.imageResult } : {}),
  };
}

async function handleAnalyzePost(post: NormalizedPostContent, tabId: number): Promise<void> {
  const replayed = await tryReplayFromHistory(post, tabId);
  if (replayed) return;

  await markScanStarted();
  let statsFinalized = false;
  const finalizeStats = async (aiDetected: boolean) => {
    if (statsFinalized) return;
    statsFinalized = true;
    await markScanFinished(aiDetected);
  };

  const settings = await getDetectionSettings();
  const enabledIso = expandUserDetectionLanguages(settings.detectionLanguages);
  const enabledLabel = formatDetectionLanguagesForUi(settings.detectionLanguages);
  let enrichedImages = post.images;
  if (settings.scanImages && enrichedImages.length === 0) {
    const preview = await fetchInstagramPreviewImageCandidate(post.url);
    if (preview) {
      enrichedImages = [preview];
    }
  }

  const shouldFetchImages = settings.scanImages && enrichedImages.length > 0;

  if (shouldFetchImages) {
    enrichedImages = await fetchImagesThrottled(enrichedImages, IMAGE_FETCH_CONCURRENCY);
  } else {
    enrichedImages = enrichedImages.map((img) => ({ ...img, bytesBase64: '' }));
  }

  // Instagram media URLs can intermittently fail to hotlink from extension context.
  // If that happens, try deriving preview media from the post permalink HTML.
  if (
    settings.scanImages &&
    post.site === 'instagram.com' &&
    !enrichedImages.some((img) => img.bytesBase64)
  ) {
    const preview = await fetchInstagramPreviewImageCandidate(post.url);
    if (preview) {
      const previewBytes = await fetchImageAsBase64(preview.srcUrl);
      if (previewBytes) {
        const alreadyPresent = enrichedImages.some((img) => img.srcUrl === preview.srcUrl);
        const hydratedPreview = { ...preview, bytesBase64: previewBytes };
        enrichedImages = alreadyPresent
          ? enrichedImages.map((img) =>
              img.srcUrl === preview.srcUrl ? { ...img, bytesBase64: previewBytes } : img,
            )
          : [hydratedPreview, ...enrichedImages];
      }
    }
  }

  const enrichedPost = { ...post, images: enrichedImages };
  const plainText = enrichedPost.text?.plain ?? '';
  const hasImages = enrichedImages.some((img) => img.bytesBase64);

  const fingerprintReplay = await tryReplayFromHistoryByFingerprint(enrichedPost, tabId);
  if (fingerprintReplay) {
    await finalizeStats(fingerprintReplay.verdict === 'likely_ai');
    return;
  }

  const earlyLangUnsupported = tryAnalyzePostLanguageUnsupported(
    enrichedPost.postId,
    plainText,
    hasImages,
    settings,
  );
  if (earlyLangUnsupported) {
    await browser.tabs.sendMessage(tabId, earlyLangUnsupported);
    await finalizeStats(false);
    return;
  }

  if (!plainText.trim() && !hasImages) {
    await browser.tabs.sendMessage(tabId, {
      type: 'DETECTION_ERROR',
      payload: { postId: enrichedPost.postId, message: 'empty text and no images' },
    });
    await finalizeStats(false);
    return;
  }

  if (USE_FAKE_DETECTION) {
    const fakeResponse = buildFakeResponse(enrichedPost);
    if (fakeResponse) {
      await browser.tabs.sendMessage(tabId, {
        type: 'DETECTION_RESULT',
        payload: fakeResponse,
      });
      maybeSaveToHistory(enrichedPost, fakeResponse, tabId).catch(() => {});
      await finalizeStats(fakeResponse.verdict === 'likely_ai');
    } else {
      await browser.tabs.sendMessage(tabId, {
        type: 'DETECTION_ERROR',
        payload: { postId: enrichedPost.postId, message: 'fake detection returned no result' },
      });
      await finalizeStats(false);
    }
    return;
  }

  // IMAGE-only posts: use image detection only
  if (enrichedPost.contentType === 'IMAGE') {
    const firstImage = enrichedImages.find((img) => img.bytesBase64);
    if (firstImage) {
      try {
        const start = performance.now();
        const imgResult = await detectImage(firstImage.bytesBase64, firstImage.mimeType);
        const elapsedMs = Math.round(performance.now() - start);
        const mapped = mapToDetectionResponse(
          imgResult,
          enrichedPost.postId,
          elapsedMs,
          firstImage.mediaType ?? 'image',
        );

        await browser.tabs.sendMessage(tabId, {
          type: 'DETECTION_RESULT',
          payload: mapped,
        });
        maybeSaveToHistory(enrichedPost, mapped, tabId).catch(() => {});
        await finalizeStats(mapped.verdict === 'likely_ai');
        return;
      } catch (imgErr) {
        await browser.tabs.sendMessage(tabId, {
          type: 'DETECTION_ERROR',
          payload: {
            postId: enrichedPost.postId,
            message: formatDetectionFetchError(imgErr),
          },
        });
        await finalizeStats(false);
        return;
      }
    }
    await browser.tabs.sendMessage(tabId, {
      type: 'DETECTION_ERROR',
      payload: { postId: enrichedPost.postId, message: 'image detection failed' },
    });
    await finalizeStats(false);
    return;
  }

  // TEXT and MIXED posts: run text detection (primary).
  // For MIXED posts with images, also run image detection in parallel.
  if (!plainText.trim()) {
    await browser.tabs.sendMessage(tabId, {
      type: 'DETECTION_ERROR',
      payload: { postId: enrichedPost.postId, message: 'empty text' },
    });
    await finalizeStats(false);
    return;
  }

  const textLangSupported = isTextLanguageSupported(plainText, enabledIso);
  const langInfo = !textLangSupported ? getLanguageSupportInfo(plainText, enabledIso) : null;

  // TEXT-only posts with unsupported language: block entirely.
  if (!textLangSupported && !hasImages) {
    const copyBlocked = getLanguageUnsupportedCopy(langInfo!, enabledLabel, settings.detectionLanguages);
    await browser.tabs.sendMessage(tabId, {
      type: 'DETECTION_LANGUAGE_UNSUPPORTED',
      payload: {
        postId: enrichedPost.postId,
        message: copyBlocked.badge,
        detectedCode: langInfo!.detectedCode,
        confidence: langInfo!.confidence,
        detectedLanguageName: langInfo!.detectedName,
        hoverSimple: copyBlocked.hoverSimple,
        hoverTooltipTitle: copyBlocked.hoverTooltipTitle,
        hoverTooltipBody: copyBlocked.hoverTooltipBody,
      },
    });
    await finalizeStats(false);
    return;
  }

  try {
    // Fire text detection only when language is supported;
    // for MIXED with fetched images, also fire image detection in parallel.
    const firstImage = hasImages ? enrichedImages.find((img) => img.bytesBase64) : undefined;

    const textPromise = textLangSupported
      ? (async () => {
          const start = performance.now();
          const result = await detectText(plainText, settings.highlightSegments);
          return { result, elapsedMs: Math.round(performance.now() - start) };
        })()
      : Promise.resolve(null);

    const imagePromise = firstImage
      ? (async () => {
          try {
            const start = performance.now();
            const result = await detectImage(firstImage.bytesBase64, firstImage.mimeType);
            return { result, elapsedMs: Math.round(performance.now() - start) };
          } catch {
            return null; // image detection is best-effort
          }
        })()
      : Promise.resolve(null);

    const [textResult, imageResult] = await Promise.all([textPromise, imagePromise]);

    // If text was skipped (unsupported language) but image succeeded, return image-only result.
    // Use the image result as the primary verdict (don't also set imageResult, which would
    // cause the renderer to show the same image data twice).
    if (!textResult && imageResult) {
      const imgResponse = mapToDetectionResponse(
        imageResult.result,
        enrichedPost.postId,
        imageResult.elapsedMs,
        firstImage?.mediaType ?? 'image',
      );
      await browser.tabs.sendMessage(tabId, {
        type: 'DETECTION_RESULT',
        payload: imgResponse,
      });
      maybeSaveToHistory(enrichedPost, imgResponse, tabId).catch(() => {});
      await finalizeStats(imgResponse.verdict === 'likely_ai');
      return;
    }

    // If both were skipped, report unsupported language.
    if (!textResult && !imageResult) {
      const copyBoth = getLanguageUnsupportedCopy(langInfo!, enabledLabel, settings.detectionLanguages);
      await browser.tabs.sendMessage(tabId, {
        type: 'DETECTION_LANGUAGE_UNSUPPORTED',
        payload: {
          postId: enrichedPost.postId,
          message: copyBoth.badge,
          detectedCode: langInfo!.detectedCode,
          confidence: langInfo!.confidence,
          detectedLanguageName: langInfo!.detectedName,
          hoverSimple: copyBoth.hoverSimple,
          hoverTooltipTitle: copyBoth.hoverTooltipTitle,
          hoverTooltipBody: copyBoth.hoverTooltipBody,
        },
      });
      await finalizeStats(false);
      return;
    }

    const mapped = mapToDetectionResponse(textResult!.result, enrichedPost.postId, textResult!.elapsedMs);

    if (imageResult) {
      mapped.imageResult = mapToImageDetectionResult(
        imageResult.result,
        imageResult.elapsedMs,
        firstImage?.mediaType ?? 'image',
      );
    }

    await browser.tabs.sendMessage(tabId, {
      type: 'DETECTION_RESULT',
      payload: mapped,
    });
    maybeSaveToHistory(enrichedPost, mapped, tabId).catch(() => {});
    await finalizeStats(mapped.verdict === 'likely_ai');
  } catch (err) {
    await browser.tabs.sendMessage(tabId, {
      type: 'DETECTION_ERROR',
      payload: { postId: enrichedPost.postId, message: formatDetectionFetchError(err) },
    });
    await finalizeStats(false);
  }
}

async function fetchInstagramPreviewImageCandidate(
  postUrl: string,
): Promise<NormalizedPostContent['images'][number] | null> {
  const trimmed = (postUrl ?? '').trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (!url.hostname.includes('instagram.com')) return null;
  if (!/\/(?:p|reel)\//.test(url.pathname)) return null;

  try {
    const response = await fetch(url.toString(), { credentials: 'include' });
    if (!response.ok) return null;
    const html = await response.text();
    const previewUrl = extractOgImageUrl(html);
    if (!previewUrl) return null;

    const mediaType: MediaType = url.pathname.includes('/reel/') ? 'video' : 'image';
    return {
      imageId: `ig-og-${fnv1a32Hex(previewUrl)}`,
      bytesBase64: '',
      srcUrl: previewUrl,
      mimeType: mimeTypeFromImageUrl(previewUrl),
      mediaType,
    };
  } catch {
    return null;
  }
}

function extractOgImageUrl(html: string): string | null {
  const patterns = [
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i,
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    const decoded = raw.replace(/&amp;/g, '&');
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      return decoded;
    }
  }

  return null;
}

function mimeTypeFromImageUrl(url: string): string {
  const path = url.split('?')[0].split('#')[0].toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.avif')) return 'image/avif';
  return 'image/jpeg';
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
// Skips fetch when srcUrl is empty, a data/blob URL, or otherwise invalid —
// e.g. LinkedIn lazy-loading can yield empty src before the real URL loads,
// and fetch("") in a service worker can resolve to chrome-extension://invalid/.
async function fetchImageAsBase64(srcUrl: string): Promise<string> {
  const trimmed = (srcUrl ?? "").trim();
  if (
    !trimmed ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("chrome-extension:") ||
    (!trimmed.startsWith("http://") && !trimmed.startsWith("https://"))
  ) {
    return "";
  }
  try {
    const response = await fetch(trimmed);
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

/** Image `/detect-image` JSON has no `highlights`; text `/detect` does. */
function isTextDetectApiResult(
  result: DetectResponse | DetectImageResponse,
): result is DetectResponse {
  return 'highlights' in result;
}

function normalizeApiHighlightSpans(raw: HighlightSpan[]): HighlightSpan[] {
  return raw.filter(
    (s) =>
      Number.isFinite(s.start) &&
      Number.isFinite(s.end) &&
      Number.isFinite(s.score) &&
      s.start >= 0 &&
      s.end > s.start &&
      Number.isInteger(s.start) &&
      Number.isInteger(s.end),
  );
}

function mapToDetectionResponse(
  apiResult: DetectResponse | DetectImageResponse,
  postId: string,
  timingMs: number,
  detectionSource: DetectionResponse['detectionSource'] = 'text',
): DetectionResponse {
  //console.log('[mapToDetectionResponse] processed DetectResponse', apiResult);

  const confidencePercent = apiResult.confidence <= 1
    ? apiResult.confidence * 100
    : apiResult.confidence;

  const verdict: DetectionResponse['verdict'] = confidencePercent > 60
    ? 'likely_ai'
    : confidencePercent >= 40
      ? 'unknown'
      : 'likely_human';

  const rawSpans: HighlightSpan[] =
    isTextDetectApiResult(apiResult) && Array.isArray(apiResult.highlights)
      ? apiResult.highlights.map((h) => ({
          start: h.start,
          end: h.end,
          score: h.score,
        }))
      : [];

  const highlightedSpans = normalizeApiHighlightSpans(rawSpans);

  const highlights =
    highlightedSpans.length > 0
      ? highlightedSpans.map((s) => ({
          start: s.start,
          end: s.end,
          reason:
            'Segment influence (model attribution): ' +
            `${s.score.toFixed(4)} — larger values correlate with stronger push toward the model’s AI score.`,
        }))
      : [];

  return {
    requestId: crypto.randomUUID(),
    postId,
    verdict,
    confidence: apiResult.confidence,
    detectionSource,
    explanation: {
      summary: apiResult.explanation,
      highlights,
      ...(highlightedSpans.length > 0 ? { highlightedSpans } : {}),
      model: { name: 'slopmop-api', version: '1.0' },
      cache: { hit: false, ttlRemainingMs: 0 },
      timing: { totalMs: timingMs, inferenceMs: timingMs },
    },
  };
}

function mapToImageDetectionResult(
  apiResult: DetectImageResponse,
  timingMs: number,
  mediaType: MediaType = 'image',
): ImageDetectionResult {
  const confidencePercent = apiResult.confidence <= 1
    ? apiResult.confidence * 100
    : apiResult.confidence;

  const verdict: ImageDetectionResult['verdict'] = confidencePercent > 60
    ? 'likely_ai'
    : confidencePercent >= 40
      ? 'unknown'
      : 'likely_human';

  return {
    verdict,
    confidence: apiResult.confidence,
    summary: apiResult.explanation,
    model: { name: 'nonescape-mini', version: '0.1' },
    timingMs,
    mediaType,
  };
}

