import React, { useEffect, useState, useCallback } from 'react';
import browser from 'webextension-polyfill';
import { normalizeConfidence, resolveExplanation } from '@src/utils/generateExplanation';
import { Settings, Stats, defaultSettings } from './types';
import { useAuth } from '../../hooks/useAuth';
import {
  getOrCreateUserSettings,
  updateDetectionSettings,
  resetStats as firestoreResetStats,
  resetSettings as firestoreResetSettings,
} from '../../lib/firestore';
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

  useEffect(() => {
    browser.storage.local
      .get([
        'enabled',
        'postsScanned',
        'aiDetected',
        'postsProcessing',
        'settings',
        // Most recent backend `/detect` response (if/when written by detection pipeline)
        'detectResponse',
        'lastDetectResponse',
        'lastDetection',
        'detectionResult',
      ])
      .then((result) => {
        if (result.enabled !== undefined) setEnabled(result.enabled as boolean);
        setStats({
          postsScanned: (result.postsScanned as number) || 0,
          aiDetected: (result.aiDetected as number) || 0,
          postsProcessing: (result.postsProcessing as number) || 0,
        });
        if (result.settings) {
          setSettings({ ...defaultSettings, ...(result.settings as Settings) });
        }

        const raw =
          (result.lastDetectResponse as unknown) ??
          (result.detectResponse as unknown) ??
          (result.lastDetection as unknown) ??
          (result.detectionResult as unknown);
        if (raw && typeof raw === 'object') setDetectResponse(raw as DetectResponse);
      });
  }, []);
  // ── Sync settings from Firestore when the user signs in ──────
  const loadSettings = useCallback(async () => {
    if (!user) return;
    try {
      const remote = await getOrCreateUserSettings(user.uid);
      const merged: Settings = {
        sensitivity: remote.settings.sensitivity,
        highlightStyle: remote.settings.highlightStyle,
        showNotifications: remote.settings.showNotifications,
        platforms: { ...remote.settings.platforms },
      };
      setSettings(merged);
      setStats(remote.stats);
      // Mirror to local storage so the content script can read without Firestore
      browser.storage.local.set({ settings: merged });
      browser.storage.local.set({
        postsScanned: remote.stats.postsScanned,
        aiDetected: remote.stats.aiDetected,
        postsProcessing: remote.stats.postsProcessing,
      });
    } catch (err) {
      console.error('[Popup] Failed to load Firestore settings:', err);
      // Fall back to local storage
      const result = await browser.storage.local.get([
        'enabled', 'postsScanned', 'aiDetected', 'postsProcessing', 'settings',
      ]);
      if (result.enabled !== undefined) setEnabled(result.enabled as boolean);
      setStats({
        postsScanned: (result.postsScanned as number) || 0,
        aiDetected: (result.aiDetected as number) || 0,
        postsProcessing: (result.postsProcessing as number) || 0,
      });
      if (result.settings) {
        setSettings({ ...defaultSettings, ...(result.settings as Settings) });
      }
    }
  }, [user]);

  useEffect(() => {
    // Load local "enabled" flag (not stored in Firestore)
    browser.storage.local.get(['enabled']).then((result) => {
      if (result.enabled !== undefined) setEnabled(result.enabled as boolean);
    });
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
        if (raw && typeof raw === 'object') setDetectResponse(raw as DetectResponse);
        else setDetectResponse(null);
        break;
      }
    };

    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
  }, []);

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    browser.storage.local.set({ enabled: next });
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
      platforms: { ...defaultUserSettings.settings.platforms },
    };
    setSettings(defaults);
    browser.storage.local.set({ settings: defaults });
    flashSaved();
    if (user) {
      firestoreResetSettings(user.uid).catch(console.error);
    }
  };

  // ── Loading state ─────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="w-full bg-gray-900 text-white p-4 flex items-center justify-center min-h-[100px]">
        <p className="text-xs text-gray-400">Loading…</p>
      </div>
    );
  }

  // ── Auth gate: redirect to sign-in if not authenticated ───────
  if (!user) {
    return <SignInView />;
  }

  // ── Settings view ─────────────────────────────────────────────
  if (view === 'settings') {
    return (
      <div className="w-full bg-gray-900 text-white flex flex-col overflow-hidden">
        <SettingsHeader saved={saved} onBack={() => setView('home')} />

        <div className="px-4 py-3 space-y-4 overflow-y-auto overscroll-none flex-1">
          <DetectionSettings settings={settings} onUpdateSetting={updateSetting} />

          <PlatformSettings platforms={settings.platforms} onUpdatePlatform={updatePlatform} />

          <DataSettings onResetStats={handleResetStats} onResetSettings={handleResetSettings} />

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
  const explanation = detectResponse
    ? resolveExplanation({
        explanation: detectResponse.explanation as string | undefined,
        confidence: rawConfidence,
        metadataComplete: detectResponse.metadataComplete as boolean | undefined,
      })
    : null;

  // ── Home view ─────────────────────────────────────────────────
  return (
    <div className="w-full bg-gray-900 text-white p-4 flex flex-col gap-4 overflow-hidden overscroll-none">
      <PopupHeader enabled={enabled} onSettingsClick={() => setView('settings')} />

      <DetectionToggle enabled={enabled} onToggle={toggleEnabled} />

      <StatsGrid stats={stats} />

      <DisclaimerBanner />

      {confidenceScore != null && <ConfidenceDisplay confidenceScore={confidenceScore} />}

      <button
        onClick={() => logOut()}
        className="w-full py-2 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
      >
        Sign Out
      </button>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-400">{stats.postsScanned}</p>
          <p className="text-[11px] text-gray-400 mt-1">Posts Scanned</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-purple-400">{stats.postsProcessing}</p>
          <p className="text-[11px] text-gray-400 mt-1">Processing</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-400">{stats.aiDetected}</p>
          <p className="text-[11px] text-gray-400 mt-1">AI Detected</p>
        </div>
      </div>

      {/* Disclaimer - Always visible at top */}
      <div className="mt-4 px-3 py-2 bg-amber-900/30 border border-amber-700/50 rounded text-xs text-amber-200">
        <p className="font-medium mb-1">ℹ️ Detection Notice</p>
        <p className="text-amber-300/90">
          Results are probability-based estimates, not definitive determinations.
        </p>
      </div>
      {/* Detection result details: confidence + explanation (kept subtle, no layout shifts) */}
      {detectResponse && (
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
