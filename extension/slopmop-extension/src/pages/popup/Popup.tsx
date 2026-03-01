import React, { useEffect, useState } from 'react';
import logo from '@assets/img/logo.svg';
import browser from 'webextension-polyfill';
import { normalizeConfidence, resolveExplanation } from '@src/utils/generateExplanation';
import { useTheme } from '@src/hooks/useTheme';

type DetectResponse = {
  confidence?: number;
  explanation?: string;
  metadataComplete?: boolean;
  // Some backends may use alternative field names.
  confidenceScore?: number;
  confidence_score?: number;
} & Record<string, unknown>;

interface Stats {
  postsScanned: number;
  aiDetected: number;
  postsProcessing: number;
}

interface Settings {
  sensitivity: 'low' | 'medium' | 'high';
  highlightStyle: 'badge' | 'border' | 'dim';
  platforms: {
    twitter: boolean;
    reddit: boolean;
    facebook: boolean;
    youtube: boolean;
    linkedin: boolean;
  };
  showNotifications: boolean;
  accessibilityMode: boolean;
}

const defaultSettings: Settings = {
  sensitivity: 'medium',
  highlightStyle: 'badge',
  platforms: { twitter: true, reddit: true, facebook: true, youtube: true, linkedin: true },
  showNotifications: true,
  accessibilityMode: false,
};

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-checked={isDark}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full bg-gray-300 dark:bg-gray-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-900"
    >
      <span className="sr-only">{isDark ? 'Dark mode' : 'Light mode'}</span>
      <span
        className={`pointer-events-none absolute top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform duration-200 ${
          isDark ? 'left-1 translate-x-7' : 'left-1 translate-x-0'
        }`}
      >
        {isDark ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
          </svg>
        )}
      </span>
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</p>
        {description && <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
          checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 translate-y-0.5 ${
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export default function Popup() {
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

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      browser.storage.local.set({ settings: next });
      flashSaved();
      return next;
    });
  };

  const updatePlatform = (platform: keyof Settings['platforms'], value: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, platforms: { ...prev.platforms, [platform]: value } };
      browser.storage.local.set({ settings: next });
      flashSaved();
      return next;
    });
  };

  const resetStats = () => {
    setStats({ postsScanned: 0, aiDetected: 0, postsProcessing: 0 });
    browser.storage.local.set({ postsScanned: 0, aiDetected: 0, postsProcessing: 0 });
    flashSaved();
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    browser.storage.local.set({ settings: defaultSettings });
    flashSaved();
  };

  // ── Settings view ─────────────────────────────────────────────
  if (view === 'settings') {
    return (
      <div className={`w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white flex flex-col overflow-hidden ${settings.accessibilityMode ? 'accessibility-mode' : ''}`}>
        {/* Settings header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <button
            onClick={() => setView('home')}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold">Settings</h2>
          <span className={`ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full transition-opacity duration-300 bg-green-500/20 text-green-400 ${
            saved ? 'opacity-100' : 'opacity-0'
          }`}>Saved</span>
        </div>

        <div className="px-4 py-3 space-y-4 overflow-y-auto overscroll-none flex-1">
          {/* Appearance */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1.5">Appearance</p>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Theme</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Light or dark mode</p>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </section>
          {/* Accessibility */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Accessibility</p>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 space-y-0 divide-y divide-gray-200 dark:divide-gray-700">
              <Toggle
                checked={settings.accessibilityMode}
                onChange={(v) => updateSetting('accessibilityMode', v)}
                label="Accessibility Mode"
                description="Larger text and higher contrast for low-vision users"
              />
            </div>
          </section>
          {/* Detection */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Detection</p>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 space-y-0 divide-y divide-gray-200 dark:divide-gray-700">
              <Toggle
                checked={settings.showNotifications}
                onChange={(v) => updateSetting('showNotifications', v)}
                label="Show Notifications"
                description="Alert when AI content is detected"
              />
              <div className="py-2.5">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Sensitivity</p>
                <div className="flex gap-1.5">
                  {(['low', 'medium', 'high'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => updateSetting('sensitivity', level)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                        settings.sensitivity === level
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <div className="py-2.5">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Highlight Style</p>
                <div className="flex gap-1.5">
                  {(['badge', 'border', 'dim'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => updateSetting('highlightStyle', style)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                        settings.highlightStyle === style
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Platforms */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Platforms</p>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 divide-y divide-gray-200 dark:divide-gray-700">
              {(Object.keys(settings.platforms) as Array<keyof Settings['platforms']>).map((p) => (
                <Toggle
                  key={p}
                  checked={settings.platforms[p]}
                  onChange={(v) => updatePlatform(p, v)}
                  label={p.charAt(0).toUpperCase() + p.slice(1)}
                />
              ))}
            </div>
          </section>

          {/* Data */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Data</p>
            <div className="flex gap-2">
              <button
                onClick={resetStats}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Reset Stats
              </button>
              <button
                onClick={resetSettings}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors cursor-pointer"
              >
                Reset All
              </button>
            </div>
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
    <div className={`w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-4 flex flex-col gap-4 overflow-hidden overscroll-none ${settings.accessibilityMode ? 'accessibility-mode' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <img src={logo} className="h-9 w-9" alt="SlopMop logo" />
        <h1 className="text-lg font-bold tracking-tight">SlopMop</h1>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
          enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {enabled ? 'Active' : 'Paused'}
        </span>
        <button
          onClick={() => setView('settings')}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors cursor-pointer"
          aria-label="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Toggle */}
      <button
        onClick={toggleEnabled}
        className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors cursor-pointer ${
          enabled
            ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
            : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
        }`}
      >
        {enabled ? 'Pause Detection' : 'Enable Detection'}
      </button>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-400">{stats.postsScanned}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Posts Scanned</p>
        </div>
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-purple-400">{stats.postsProcessing}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Processing</p>
        </div>
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-400">{stats.aiDetected}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">AI Detected</p>
        </div>
      </div>

      {/* Disclaimer - Always visible at top */}
      <div className="mt-4 px-3 py-2 bg-amber-900/30 border border-amber-700/50 rounded text-xs text-amber-200">
        <p className="font-medium mb-1">ℹ️ Detection Notice</p>
        <p className="text-amber-300/90">
          Results are probability-based estimates, not definitive determinations.
        </p>
      </div>
      {detectResponse && (
        <section className="mt-4 text-left">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Confidence: {confidence != null ? `${Math.round(confidence * 100)}%` : '—'}
          </p>
          <p className="confidence-explanation mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-snug">
            {explanation}
          </p>
        </section>
      )}
    </div>
  );
}
