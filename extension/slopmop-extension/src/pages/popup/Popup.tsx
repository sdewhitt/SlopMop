import React, { useEffect, useState, useCallback } from 'react';
import browser from 'webextension-polyfill';
import 'react/jsx-runtime';
import { normalizeConfidence, resolveExplanation } from '@src/utils/generateExplanation';
import { formatPatternReasons } from '@src/utils/aiTextPatterns';
import { Settings, Stats, defaultSettings } from './types';
import { useAuth } from '../../hooks/useAuth';
import {
  getOrCreateUserSettings,
  updateDetectionSettings,
  resetStats as firestoreResetStats,
  resetSettings as firestoreResetSettings,
} from '../../lib/firestoreProxy';
import { defaultUserSettings } from '../../utils/userSettings';
import PopupHeader from './components/PopupHeader';
import DetectionToggle from './components/DetectionToggle';
import StatsGrid from './components/StatsGrid';
import DisclaimerBanner from './components/DisclaimerBanner';
import ConfidenceDisplay from './components/ConfidenceDisplay';
import SettingsHeader from './components/SettingsHeader';
import DetectionSettings from './components/DetectionSettings';
import PlatformSettings from './components/PlatformSettings';
import DataSettings from './components/DataSettings';
import SignInView from './components/SignInView';
import DisabledWebsitesManager from '../options/DisabledWebsitesManager';
import { UNSUPPORTED_LANGUAGE_MESSAGE } from '@src/utils/languageSupport';

type DetectResponse = {
  confidence?: number;
  explanation?: string;
  metadataComplete?: boolean;
  // Some backends may use alternative field names.
  confidenceScore?: number;
  confidence_score?: number;
} & Record<string, unknown>;

export default function Popup() {
  const { user, loading: authLoading, logOut } = useAuth();

  const [view, setView] = useState<'home' | 'settings'>('home');
  const [enabled, setEnabled] = useState(true);
  const [stats, setStats] = useState<Stats>({ postsScanned: 0, aiDetected: 0, postsProcessing: 0 });
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [detectResponse, setDetectResponse] = useState<DetectResponse | null>(null);
  const [languageUnsupported, setLanguageUnsupported] = useState<string | null>(null);
  const [simpleMode, setSimpleMode] = useState(false);

  const syncStatsFromStorage = useCallback((stored: Record<string, unknown>) => {
    setStats({
      postsScanned: typeof stored.postsScanned === 'number' ? stored.postsScanned : 0,
      aiDetected: typeof stored.aiDetected === 'number' ? stored.aiDetected : 0,
      postsProcessing: typeof stored.postsProcessing === 'number' ? stored.postsProcessing : 0,
    });
  }, []);

  useEffect(() => {
    browser.storage.local
      .get([
        'postsScanned',
        'aiDetected',
        'postsProcessing',
        'settings',
        'simpleMode',
        'detectResponse',
        'lastDetectResponse',
        'lastDetection',
        'detectionResult',
        'lastDetectLanguageUnsupported',
      ])
      .then((result) => {
        syncStatsFromStorage(result);
        if (result.settings) {
          const merged = { ...defaultSettings, ...(result.settings as Settings) };
          setSettings(merged);
          setEnabled(merged.enabled);
        }
        if (typeof result.simpleMode === 'boolean') {
          setSimpleMode(result.simpleMode);
        }

        const raw =
          (result.lastDetectResponse as unknown) ??
          (result.detectResponse as unknown) ??
          (result.lastDetection as unknown) ??
          (result.detectionResult as unknown);
        if (raw && typeof raw === 'object') setDetectResponse(raw as DetectResponse);
        const unsupported = result.lastDetectLanguageUnsupported as { message?: string } | undefined;
        setLanguageUnsupported(unsupported?.message ?? null);
      });
  }, [syncStatsFromStorage]);
  // ── Sync settings from Firestore when the user signs in ──────
  const loadSettings = useCallback(async () => {
    if (!user) return;
    try {
      const remote = await getOrCreateUserSettings(user.uid);
      const local = await browser.storage.local.get([
        'settings',
        'postsScanned',
        'aiDetected',
        'postsProcessing',
      ]);
      const localSettings = local.settings as Partial<Settings> | undefined;
      const localStats = {
        postsScanned: typeof local.postsScanned === 'number' ? local.postsScanned : 0,
        aiDetected: typeof local.aiDetected === 'number' ? local.aiDetected : 0,
        postsProcessing: typeof local.postsProcessing === 'number' ? local.postsProcessing : 0,
      };
      const mergedStats = {
        postsScanned: Math.max(remote.stats.postsScanned, localStats.postsScanned),
        aiDetected: Math.max(remote.stats.aiDetected, localStats.aiDetected),
        postsProcessing: localStats.postsProcessing,
      };
      const merged: Settings = {
        sensitivity: remote.settings.sensitivity,
        highlightStyle: remote.settings.highlightStyle,
        showNotifications: remote.settings.showNotifications,
        automaticScanning: remote.settings.automaticScanning ?? defaultSettings.automaticScanning,
        platforms: { ...remote.settings.platforms },
        enabled: remote.settings.enabled ?? defaultSettings.enabled,
        scanText: remote.settings.scanText ?? defaultSettings.scanText,
        scanImages: remote.settings.scanImages ?? defaultSettings.scanImages,
        scanComments: remote.settings.scanComments ?? defaultSettings.scanComments,
        uiMode: remote.settings.uiMode ?? defaultSettings.uiMode,
        accessibilityMode: localSettings?.accessibilityMode ?? defaultSettings.accessibilityMode,
      };
      setSettings(merged);
      setEnabled(merged.enabled);
      setStats(mergedStats);
      browser.storage.local.set({ settings: merged });
      browser.storage.local.set(mergedStats);
    } catch (err) {
      console.error('[Popup] Failed to load Firestore settings:', err);
      const result = await browser.storage.local.get([
        'postsScanned', 'aiDetected', 'postsProcessing', 'settings',
      ]);
      syncStatsFromStorage(result);
      if (result.settings) {
        const merged = { ...defaultSettings, ...(result.settings as Settings) };
        setSettings(merged);
        setEnabled(merged.enabled);
      }
    }
  }, [syncStatsFromStorage, user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Keep popup updated when detection writes a new `/detect` response to storage.
  useEffect(() => {
    const handler = (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      const keys = ['lastDetectResponse', 'detectResponse', 'lastDetection', 'detectionResult'] as const;
      for (const key of keys) {
        const change = changes[key];
        if (!change) continue;
        const raw = change.newValue as unknown;
        if (raw && typeof raw === 'object') {
          setDetectResponse(raw as DetectResponse);
          setLanguageUnsupported(null);
        } else setDetectResponse(null);
        break;
      }
      const unsupportedChange = changes['lastDetectLanguageUnsupported'];
      if (unsupportedChange?.newValue != null) {
        const v = unsupportedChange.newValue as { message?: string };
        setLanguageUnsupported(v?.message ?? UNSUPPORTED_LANGUAGE_MESSAGE);
      } else if (unsupportedChange?.newValue === undefined && unsupportedChange?.oldValue != null) {
        setLanguageUnsupported(null);
      }
    };

    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
  }, []);

  useEffect(() => {
    const handler = (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      if (!changes.postsScanned && !changes.aiDetected && !changes.postsProcessing) return;

      setStats((prev) => ({
        postsScanned:
          typeof changes.postsScanned?.newValue === 'number'
            ? changes.postsScanned.newValue
            : prev.postsScanned,
        aiDetected:
          typeof changes.aiDetected?.newValue === 'number'
            ? changes.aiDetected.newValue
            : prev.aiDetected,
        postsProcessing:
          typeof changes.postsProcessing?.newValue === 'number'
            ? changes.postsProcessing.newValue
            : prev.postsProcessing,
      }));
    };

    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
  }, []);

  // Sync settings and simple mode when Options page or another tab updates storage.
  useEffect(() => {
    const handler = (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;

      const change = changes.settings;
      if (change?.newValue && typeof change.newValue === 'object') {
        setSettings({ ...defaultSettings, ...(change.newValue as Settings) });
      }

      const simpleModeChange = changes.simpleMode;
      if (typeof simpleModeChange?.newValue === 'boolean') {
        setSimpleMode(simpleModeChange.newValue);
      }
    };

    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
  }, []);

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    setSettings((prev) => {
      const updated = { ...prev, enabled: next };
      browser.storage.local.set({ settings: updated });
      if (user) {
        updateDetectionSettings(user.uid, { enabled: next }).catch(console.error);
      }
      return updated;
    });
  };

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  /** Update a single setting locally, in browser storage, and in Firestore. */
  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      browser.storage.local.set({ settings: next });
      flashSaved();
      // Persist to Firestore
      if (user) {
        updateDetectionSettings(user.uid, { [key]: value }).catch(console.error);
      }
      return next;
    });
  };

  /** Update a platform toggle locally, in browser storage, and in Firestore. */
  const updatePlatform = (platform: keyof Settings['platforms'], value: boolean) => {
    setSettings((prev) => {
      const nextPlatforms = { ...prev.platforms, [platform]: value };
      const next = { ...prev, platforms: nextPlatforms };
      browser.storage.local.set({ settings: next });
      flashSaved();
      // Persist to Firestore
      if (user) {
        updateDetectionSettings(user.uid, { platforms: nextPlatforms }).catch(console.error);
      }
      return next;
    });
  };

  const handleResetStats = () => {
    const zeroed = { postsScanned: 0, aiDetected: 0, postsProcessing: 0 };
    setStats(zeroed);
    browser.storage.local.set(zeroed);
    flashSaved();
    if (user) {
      firestoreResetStats(user.uid).catch(console.error);
    }
  };

  const handleResetSettings = () => {
    const defaults: Settings = {
      sensitivity: defaultUserSettings.settings.sensitivity,
      highlightStyle: defaultUserSettings.settings.highlightStyle,
      showNotifications: defaultUserSettings.settings.showNotifications,
      automaticScanning: defaultUserSettings.settings.automaticScanning,
      platforms: { ...defaultUserSettings.settings.platforms },
      enabled: defaultUserSettings.settings.enabled,
      scanText: defaultUserSettings.settings.scanText,
      scanImages: defaultUserSettings.settings.scanImages,
      scanComments: defaultUserSettings.settings.scanComments,
      uiMode: defaultUserSettings.settings.uiMode,
      accessibilityMode: false,
    };
    setSettings(defaults);
    setEnabled(defaults.enabled);
    setSimpleMode(false);
    browser.storage.local.set({ settings: defaults, simpleMode: false });
    flashSaved();
    if (user) {
      firestoreResetSettings(user.uid).catch(console.error);
    }
  };

  // ── Loading state ─────────────────────────────────────────────
  if (authLoading) {
    return (
      <div
        className={`w-full bg-gray-900 text-white p-4 flex items-center justify-center min-h-[100px] ${
          simpleMode ? 'simple-mode' : ''
        } ${settings.accessibilityMode ? 'accessibility-mode' : ''}`}
      >
        <p className="text-xs text-gray-400">Loading…</p>
      </div>
    );
  }

  // ── Auth gate: redirect to sign-in if not authenticated ───────
  if (!user) {
    return (
      <div
        className={`w-full min-h-[200px] ${simpleMode ? 'simple-mode' : ''} ${settings.accessibilityMode ? 'accessibility-mode' : ''}`}
      >
        <SignInView />
      </div>
    );
  }

  // ── Settings view ─────────────────────────────────────────────
  if (view === 'settings') {
    return (
      <div
        className={`w-full h-full bg-gray-900 text-white flex flex-col overflow-hidden ${
          simpleMode ? 'simple-mode' : ''
        } ${settings.accessibilityMode ? 'accessibility-mode' : ''}`}
      >
        <SettingsHeader saved={saved} onBack={() => setView('home')} />

        <div className="px-4 py-3 space-y-4 overflow-y-auto overscroll-contain flex-1" style={{ maxHeight: 'calc(580px - 52px)' }}>
          {/* Simple view: only detection on/off (on Home) and account remain; advanced settings hidden */}
          {!simpleMode && (
            <>
              <DetectionSettings settings={settings} onUpdateSetting={updateSetting} />

              <PlatformSettings platforms={settings.platforms} onUpdatePlatform={updatePlatform} />

              <DisabledWebsitesManager />

              <DataSettings onResetStats={handleResetStats} onResetSettings={handleResetSettings} />
            </>
          )}

          {/* Sign-out button */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Account
            </p>
            <p className="text-[11px] text-gray-400 mb-2 truncate">{user.email}</p>
            <button
              onClick={() => logOut()}
              className="w-full py-2 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </section>
        </div>
      </div>
    );
  }

  const rawConfidence =
    (detectResponse?.confidence as number | undefined) ??
    (detectResponse?.confidenceScore as number | undefined) ??
    (detectResponse?.confidence_score as number | undefined) ??
    null;
  const confidence = normalizeConfidence(rawConfidence);
  const baseExplanation = detectResponse
    ? resolveExplanation({
        explanation: detectResponse.explanation as string | undefined,
        confidence: rawConfidence,
        metadataComplete: detectResponse.metadataComplete as boolean | undefined,
      })
    : null;
  const patternReasons = (detectResponse as { patternReasons?: string[] } | null)?.patternReasons;
  const patternText = patternReasons?.length ? formatPatternReasons(patternReasons) : '';
  const explanation = patternText && baseExplanation ? `${patternText} ${baseExplanation}` : patternText || baseExplanation;

  // ── Home view ─────────────────────────────────────────────────
  return (
    <div
      className={`w-full bg-gray-900 text-white p-4 flex flex-col gap-4 overflow-hidden overscroll-none ${
        simpleMode ? 'simple-mode' : ''
      } ${settings.accessibilityMode ? 'accessibility-mode' : ''}`}
    >
      <PopupHeader enabled={enabled} onSettingsClick={() => setView('settings')} />

      <DetectionToggle enabled={enabled} onToggle={toggleEnabled} />

      <StatsGrid stats={stats} />

      <DisclaimerBanner />

      {languageUnsupported != null && (
        <div className="rounded-lg px-3 py-2 text-sm bg-amber-500/20 text-amber-200 border border-amber-500/50">
          {languageUnsupported}
        </div>
      )}
      {confidence != null && !languageUnsupported && <ConfidenceDisplay confidenceScore={confidence} />}

      <button
        onClick={() => logOut()}
        className="w-full py-2 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
      >
        Sign Out
      </button>
      {/* Detection result details: confidence + explanation (kept subtle, no layout shifts) */}
      {detectResponse && !languageUnsupported && (
        <section className="mt-4 text-left">
          <p className="text-sm font-medium text-gray-200">
            Confidence: {confidence != null ? `${Math.round(confidence * 100)}%` : '—'}
          </p>
          <p className="confidence-explanation mt-1.5 text-xs text-gray-400 leading-snug">
            {explanation}
          </p>
        </section>
      )}
    </div>
  );
}
