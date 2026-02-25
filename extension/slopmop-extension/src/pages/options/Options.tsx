import React, { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';

interface Settings {
  enabled: boolean;
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
}

const defaultSettings: Settings = {
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
};

const PLATFORM_KEYS: Array<keyof Settings['platforms']> = ['twitter', 'reddit', 'facebook', 'youtube', 'linkedin'];

function Toggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-center justify-between py-3 cursor-pointer group">
      <div>
        <p className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
          checked ? 'bg-blue-600' : 'bg-gray-600'
        }`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 translate-y-0.5 ${
          checked ? 'translate-x-5.5' : 'translate-x-0.5'
        }`} />
      </button>
    </label>
  );
}

export default function Options() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    browser.storage.local.get('settings').then((result) => {
      if (result.settings) {
        setSettings({ ...defaultSettings, ...(result.settings as Settings) });
      }
    });
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      browser.storage.local.set({ settings: next });
      // Sync top-level 'enabled' for popup
      if (key === 'enabled') browser.storage.local.set({ enabled: value });
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

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const resetStats = () => {
    browser.storage.local.set({ postsScanned: 0, aiDetected: 0 });
    flashSaved();
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    browser.storage.local.set({ settings: defaultSettings, enabled: defaultSettings.enabled });
    flashSaved();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-2xl font-bold tracking-tight">SlopMop Settings</h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full transition-opacity duration-300 ${
            saved ? 'opacity-100 bg-green-500/20 text-green-400' : 'opacity-0'
          }`}>Saved</span>
        </div>

        {/* General */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">General</h2>
          <div className="bg-gray-900 rounded-xl p-4 divide-y divide-gray-800">
            <Toggle
              checked={settings.enabled}
              onChange={(v) => update('enabled', v)}
              label="Enable Detection"
              description="Turn AI content detection on or off globally"
            />
            <Toggle
              checked={settings.showNotifications}
              onChange={(v) => update('showNotifications', v)}
              label="Show Notifications"
              description="Display a notification when AI content is detected"
            />
          </div>
        </section>

        {/* Detection */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Detection</h2>
          <div className="bg-gray-900 rounded-xl p-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-200">Sensitivity</label>
              <p className="text-xs text-gray-500 mb-2">Higher sensitivity flags more content but may increase false positives</p>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => update('sensitivity', level)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                      settings.sensitivity === level
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-200">Highlight Style</label>
              <p className="text-xs text-gray-500 mb-2">How flagged content is visually marked</p>
              <div className="flex gap-2">
                {(['badge', 'border', 'dim'] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => update('highlightStyle', style)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                      settings.highlightStyle === style
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
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
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Platforms</h2>
          <div className="bg-gray-900 rounded-xl p-4 divide-y divide-gray-800">
            {PLATFORM_KEYS.map((platform) => (
              <Toggle
                key={platform}
                checked={settings.platforms[platform]}
                onChange={(v) => updatePlatform(platform, v)}
                label={platform.charAt(0).toUpperCase() + platform.slice(1)}
              />
            ))}
          </div>
        </section>

        {/* Data */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Data</h2>
          <div className="bg-gray-900 rounded-xl p-4 flex gap-3">
            <button
              onClick={resetStats}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              Reset Statistics
            </button>
            <button
              onClick={resetSettings}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
            >
              Reset All Settings
            </button>
          </div>
        </section>

        {/* Footer */}
        <p className="text-center text-xs text-gray-600">SlopMop v1.0 &middot; Detect AI-generated content</p>
      </div>
    </div>
  );
}
