import React, { useEffect, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import { type Settings, defaultSettings } from '../popup/types';
import { normalizeDetectionLanguages } from '../../utils/userSettings';
import { BATTERY_THROTTLE_ACTIVE_KEY, BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY } from '../../utils/batteryThrottle';
import DisabledWebsitesManager from './DisabledWebsitesManager';
import HistoryPage from './HistoryPage';

function Toggle({ checked, onChange, label, description, disabled = false }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between py-3 group ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}>
      <div>
        <p className={`text-sm font-medium text-gray-200 ${disabled ? '' : 'group-hover:text-white'} transition-colors`}>{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(!checked);
        }}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
        } ${checked ? 'bg-blue-600' : 'bg-gray-600'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 translate-y-0.5 ${
          checked ? 'translate-x-5.5' : 'translate-x-0.5'
        }`} />
      </button>
    </label>
  );
}

type OptionsTab = 'settings' | 'history';

export default function Options() {
  const [tab, setTab] = useState<OptionsTab>('settings');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [simpleMode, setSimpleMode] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [batteryThrottleActive, setBatteryThrottleActive] = useState(false);
  const [batteryAutoLowBatteryActive, setBatteryAutoLowBatteryActive] = useState(false);
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const [settingsSearchNoMatches, setSettingsSearchNoMatches] = useState(false);
  const settingsSearchInputRef = useRef<HTMLInputElement>(null);

  const sanitizePlatforms = (platforms?: Partial<Settings['platforms']> | Record<string, unknown>) => {
    const next = { ...defaultSettings.platforms };
    if (!platforms || typeof platforms !== 'object') return next;
    const source = platforms as Record<string, unknown>;
    for (const key of Object.keys(defaultSettings.platforms) as Array<keyof Settings['platforms']>) {
      const value = source[key];
      if (typeof value === 'boolean') next[key] = value;
    }
    return next;
  };

  const mergeSettings = (raw?: Partial<Settings>): Settings => ({
    ...defaultSettings,
    ...(raw ?? {}),
    platforms: sanitizePlatforms(raw?.platforms),
    detectionLanguages: normalizeDetectionLanguages(
      raw?.detectionLanguages !== undefined ? raw.detectionLanguages : undefined,
    ),
  });

  const effectiveLowBattery = settings.lowBatteryMode || batteryAutoLowBatteryActive;

  useEffect(() => {
    browser.storage.local
      .get(['settings', 'simpleMode', 'slopmopUser', BATTERY_THROTTLE_ACTIVE_KEY, BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY])
      .then((result) => {
        if (result.settings) {
          setSettings(mergeSettings(result.settings as Partial<Settings>));
        }
        if (typeof result.simpleMode === 'boolean') {
          setSimpleMode(result.simpleMode);
        }
        const userObj = result.slopmopUser as { uid?: string } | null;
        if (userObj?.uid) setCurrentUid(userObj.uid);
        setBatteryThrottleActive(result[BATTERY_THROTTLE_ACTIVE_KEY] === true);
        setBatteryAutoLowBatteryActive(result[BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY] === true);
      });
  }, []);

  useEffect(() => {
    if (tab !== 'settings') {
      setSettingsSearchQuery('');
    }
  }, [tab]);

  useEffect(() => {
    if (tab !== 'settings') return;
    const id = requestAnimationFrame(() => settingsSearchInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'settings') {
      setSettingsSearchNoMatches(false);
      return;
    }
    const q = settingsSearchQuery.trim().toLowerCase();
    const blocks = document.querySelectorAll<HTMLElement>('.settings-search-block');
    let visible = 0;
    blocks.forEach((el) => {
      const ds = el.getAttribute('data-search') ?? '';
      const match = !q || ds.toLowerCase().includes(q);
      el.style.display = match ? '' : 'none';
      if (match) visible += 1;
    });
    setSettingsSearchNoMatches(q.length > 0 && visible === 0);
  }, [settingsSearchQuery, tab, simpleMode]);

  useEffect(() => {
    const handler = (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      const t = changes[BATTERY_THROTTLE_ACTIVE_KEY];
      if (typeof t?.newValue === 'boolean') {
        setBatteryThrottleActive(t.newValue);
      }
      const a = changes[BATTERY_AUTO_LOW_BATTERY_ACTIVE_KEY];
      if (typeof a?.newValue === 'boolean') {
        setBatteryAutoLowBatteryActive(a.newValue);
      }
    };
    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
  }, []);

  // Keep currentUid in sync with auth state changes pushed by the background.
  useEffect(() => {
    const handler = (changes: Record<string, browser.Storage.StorageChange>) => {
      if (!('slopmopUser' in changes)) return;
      const u = changes.slopmopUser.newValue as { uid?: string } | null;
      setCurrentUid(u?.uid ?? null);

      // Sync simpleMode when a new account loads (background already wrote flat key).
      const smChange = changes.simpleMode;
      if (smChange !== undefined && typeof smChange.newValue === 'boolean') {
        setSimpleMode(smChange.newValue);
      }
    };
    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      browser.storage.local.set({ settings: next });
      if (key === 'enabled') browser.storage.local.set({ enabled: value });
      // Persist accessibilityMode under a per-account namespaced key so it
      // is restored correctly when this account logs back in.
      if (key === 'accessibilityMode' && currentUid) {
        browser.storage.local.set({ [`accessibilityMode:${currentUid}`]: value });
      }
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
    if (currentUid) {
      browser.runtime.sendMessage({ type: 'SLOPMOP_RESET_STATS', uid: currentUid }).catch((err) => {
        console.error('[SlopMop] Failed to reset stats', err);
      });
    } else {
      browser.storage.local.set({ postsScanned: 0, aiDetected: 0, postsProcessing: 0 });
    }
    flashSaved();
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    setSimpleMode(false);
    const toSet: Record<string, unknown> = { settings: defaultSettings, simpleMode: false };
    if (currentUid) {
      toSet[`simpleMode:${currentUid}`] = false;
      toSet[`accessibilityMode:${currentUid}`] = false;
    }
    browser.storage.local.set(toSet);
    flashSaved();
  };

  return (
    <div className={`min-h-screen bg-gray-950 text-white ${settings.accessibilityMode ? 'accessibility-mode' : ''}`}>
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold tracking-tight">SlopMop</h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full transition-opacity duration-300 ${
            saved ? 'opacity-100 bg-green-500/20 text-green-400' : 'opacity-0'
          }`}>Saved</span>
        </div>

        {tab === 'settings' && (
        <div
          className="settings-page-search-panel mb-6"
          role="search"
          aria-label="Search settings"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Search settings</p>
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              ref={settingsSearchInputRef}
              type="text"
              value={settingsSearchQuery}
              onChange={(e) => setSettingsSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSettingsSearchQuery('');
                  e.preventDefault();
                }
              }}
              placeholder="Filter by keyword…"
              autoComplete="off"
              inputMode="search"
              className="settings-page-search-input w-full rounded-xl border border-gray-700 bg-gray-900 py-2.5 pl-10 pr-10 text-sm text-gray-200 placeholder-gray-500 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              aria-label="Filter settings by keyword"
            />
            {settingsSearchQuery.trim() !== '' && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                aria-label="Clear search"
                onClick={() => {
                  setSettingsSearchQuery('');
                  settingsSearchInputRef.current?.focus();
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
          {settingsSearchNoMatches && (
            <p className="mt-3 text-center text-sm text-gray-500" role="status">
              No matching settings found
            </p>
          )}
        </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-900 p-1 rounded-xl mb-8">
          {(['settings', 'history'] as OptionsTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg capitalize transition-colors ${
                tab === t
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* History tab */}
        {tab === 'history' && <HistoryPage />}

        {/* Settings tab */}
        {tab === 'settings' && <>

        {/* General */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">General</h2>
          <div className="bg-gray-900 rounded-xl p-4">
            <div
              className="settings-search-block border-t border-gray-800 first:border-t-0 pt-3 first:pt-0"
              data-search="enable detection global on off ai slopmop power"
            >
              <Toggle
                checked={settings.enabled}
                onChange={(v) => update('enabled', v)}
                label="Enable Detection"
                description="Turn AI content detection on or off globally"
              />
            </div>
            {!simpleMode && (
              <div
                className="settings-search-block border-t border-gray-800 pt-3"
                data-search="notifications notify alerts banner toast"
              >
                <Toggle
                  checked={settings.showNotifications}
                  onChange={(v) => update('showNotifications', v)}
                  label="Show Notifications"
                  description="Display a notification when AI content is detected"
                />
              </div>
            )}
            <div
              className="settings-search-block border-t border-gray-800 pt-3"
              data-search="scan text posts content body"
            >
              <Toggle
                checked={settings.scanText}
                onChange={(v) => update('scanText', v)}
                label="Scan Text"
                description="Analyze text content in posts"
              />
            </div>
            <div
              className="settings-search-block border-t border-gray-800 pt-3"
              data-search="language languages english spanish french eng spa fra locale multilingual"
            >
              <div className="py-3">
                <p className="text-sm font-medium text-gray-200 mb-1">Text detection languages</p>
                <p className="text-xs text-gray-500 mb-3">
                  Run text AI detection only when the post matches a selected language (detected automatically). Uncheck all to skip text detection.
                </p>
                <div className="flex flex-col gap-2">
                  {([
                    ['eng', 'English'],
                    ['spa', 'Spanish'],
                    ['fra', 'French'],
                  ] as const).map(([code, label]) => (
                    <label key={code} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={settings.detectionLanguages.includes(code)}
                        onChange={() => {
                          const cur = settings.detectionLanguages;
                          const on = cur.includes(code);
                          const next = on ? cur.filter((c) => c !== code) : [...cur, code];
                          update('detectionLanguages', next);
                        }}
                        className="rounded border-gray-600 bg-gray-800"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div
              className="settings-search-block border-t border-gray-800 pt-3"
              data-search="scan images picture photo vision multimodal"
            >
              <Toggle
                checked={settings.scanImages}
                onChange={(v) => update('scanImages', v)}
                label="Scan Images"
                description="Analyze images in posts (coming soon)"
              />
            </div>
            <div
              className="settings-search-block border-t border-gray-800 pt-3"
              data-search="low battery power saving manual charge unplugged"
            >
              <Toggle
                checked={effectiveLowBattery}
                disabled={batteryAutoLowBatteryActive && !settings.lowBatteryMode}
                onChange={(v) => update('lowBatteryMode', v)}
                label="Low battery mode"
                description="Manual power saving: locks Automatic Scanning off until you turn this off. Separate from automatic pause when the battery is low (message below)."
              />
            </div>
            <div
              className="settings-search-block border-t border-gray-800 pt-3"
              data-search="battery automatic low threshold pause resume plug charge"
            >
              <div className="py-3">
                <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={settings.lowBatteryModeAutoWhenBatteryLow}
                    onChange={(e) => update('lowBatteryModeAutoWhenBatteryLow', e.target.checked)}
                    className="mt-0.5 rounded border-gray-600 bg-gray-800"
                  />
                  <span>
                    <span className="font-medium text-gray-200">Turn on automatically when the battery is low</span>
                    <span className="block text-xs text-gray-500 mt-0.5 leading-snug">
                      Same thresholds as automatic pause below. Your saved Automatic Scanning preference is not changed;
                      when charge is above the resume threshold or you plug in, behavior returns to your saved settings.
                    </span>
                  </span>
                </label>
                {batteryAutoLowBatteryActive && !settings.lowBatteryMode && (
                  <p className="text-xs text-gray-500 mt-2 pl-6 leading-snug" role="status">
                    Low battery mode is on automatically until the battery recovers or you turn off the option above.
                  </p>
                )}
              </div>
            </div>
            <div
              className="settings-search-block border-t border-gray-800 pt-3"
              data-search="automatic scanning manual detect now feed posts queue"
            >
              <Toggle
                checked={effectiveLowBattery ? false : settings.automaticScanning}
                disabled={effectiveLowBattery}
                onChange={(v) => update('automaticScanning', v)}
                label="Automatic Scanning"
                description="When off, posts require clicking Detect Now"
              />
              {batteryThrottleActive && settings.automaticScanning && !effectiveLowBattery && (
                <p className="text-xs text-amber-400/95 px-0 pb-2 -mt-1 leading-snug" role="status">
                  Automatic scanning is paused while the battery is low and unplugged. Plug in or charge above the
                  threshold to resume.
                </p>
              )}
            </div>
            <div
              className="settings-search-block border-t border-gray-800 pt-3"
              data-search="accessibility a11y contrast vision large text readability"
            >
              <Toggle
                checked={settings.accessibilityMode}
                onChange={(v) => update('accessibilityMode', v)}
                label="Accessibility Mode"
                description="Larger text and higher contrast for low-vision users"
              />
            </div>
            <div
              className="settings-search-block border-t border-gray-800 pt-3"
              data-search="simple mode basic beginner advanced hide"
            >
              <Toggle
                checked={simpleMode}
                onChange={(v) => {
                  setSimpleMode(v);
                  // Write to flat key (live) + namespaced key (persisted per-account).
                  const toSet: Record<string, unknown> = { simpleMode: v };
                  if (currentUid) toSet[`simpleMode:${currentUid}`] = v;
                  browser.storage.local.set(toSet);
                  flashSaved();
                }}
                label="Simple Mode"
                description="Hide advanced options and show only basic controls"
              />
            </div>
          </div>
        </section>

        {/* Detection */}
        {!simpleMode && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Detection</h2>
            <div className="bg-gray-900 rounded-xl p-4 space-y-4">
              <div
                className="settings-search-block"
                data-search="badge position corner top bottom left right placement indicator"
              >
                <label className="text-sm font-medium text-gray-200">Badge Position</label>
                <p className="text-xs text-gray-500 mb-2">Place detection indicators in your preferred corner</p>
                <div className="flex gap-2">
                  {([
                    ['top_right', 'Top-right'],
                    ['top_left', 'Top-left'],
                    ['bottom_right', 'Bottom-right'],
                  ] as const).map(([pos, label]) => (
                    <button
                      key={pos}
                      onClick={() => update('badgePosition', pos)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        settings.badgePosition === pos
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="settings-search-block"
                data-search="indicator theme appearance color style default minimal contrast dark light badge overlay"
              >
                <label className="text-sm font-medium text-gray-200">Indicator Theme</label>
                <p className="text-xs text-gray-500 mb-2">Pick your preferred detection color style</p>
                <div className="flex gap-2">
                  {([
                    ['default', 'Default'],
                    ['high_contrast', 'High Contrast'],
                    ['minimal', 'Minimal'],
                  ] as const).map(([theme, label]) => (
                    <button
                      key={theme}
                      onClick={() => update('detectionTheme', theme)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        settings.detectionTheme === theme
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="settings-search-block"
                data-search="badge size indicator small medium large zoom readability"
              >
                <label className="text-sm font-medium text-gray-200">Badge Size</label>
                <p className="text-xs text-gray-500 mb-2">Adjust in-page detection indicator size for readability</p>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => update('badgeSize', size)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                        settings.badgeSize === size
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="settings-search-block"
                data-search="highlight style border dim underline mark flagged overlay"
              >
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

              <div className="pt-4 border-t border-gray-800 space-y-4">
                <div
                  className="settings-search-block"
                  data-search="highlight segments explain attribution score text span"
                >
                  <Toggle
                    checked={settings.highlightSegments}
                    onChange={(v) => update('highlightSegments', v)}
                    label="Highlight segments that triggered detection"
                    description="Show which parts of the text contributed most to the AI score"
                  />
                </div>
                <div
                  className="settings-search-block"
                  data-search="fact check claim review verify wikipedia sources backend"
                >
                  <Toggle
                    checked={settings.factCheck}
                    onChange={(v) => update('factCheck', v)}
                    label="Show Fact check"
                    description="Fact check button beside Detect Now; runs ClaimReview search via backend"
                  />
                </div>
                <div
                  className="settings-search-block"
                  data-search="power user timing milliseconds detect fact check server latency debug"
                >
                  <Toggle
                    checked={settings.powerUserTiming}
                    onChange={(v) => update('powerUserTiming', v)}
                    label="Power user timing"
                    description="On hover, show server-reported Detect and Fact-check times (ms) on post badges when available"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Platforms */}
        {!simpleMode && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Platforms</h2>
            <div className="bg-gray-900 rounded-xl p-4 divide-y divide-gray-800">
              {(Object.keys(settings.platforms) as Array<keyof Settings['platforms']>).map((platform) => (
                <div
                  key={platform}
                  className="settings-search-block"
                  data-search={`${platform} social network site feed ${platform === 'linkedin' ? 'professional' : ''}`}
                >
                  <Toggle
                    checked={settings.platforms[platform]}
                    onChange={(v) => updatePlatform(platform, v)}
                    label={platform.charAt(0).toUpperCase() + platform.slice(1)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Disabled Websites */}
        {!simpleMode && (
          <div
            className="settings-search-block"
            data-search="disabled websites blocklist ignore whitelist url domain skip"
          >
            <DisabledWebsitesManager />
          </div>
        )}

        {/* Data */}
        {!simpleMode && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Data</h2>
            <div className="bg-gray-900 rounded-xl p-4 flex gap-3">
              <div
                className="settings-search-block flex-1"
                data-search="reset statistics stats counters scanned detected counts"
              >
                <button
                  type="button"
                  onClick={resetStats}
                  className="w-full py-2.5 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  Reset Statistics
                </button>
              </div>
              <div
                className="settings-search-block flex-1"
                data-search="reset all settings factory defaults restore clear"
              >
                <button
                  type="button"
                  onClick={resetSettings}
                  className="w-full py-2.5 rounded-lg text-sm font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                >
                  Reset All Settings
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-600">SlopMop v1.0 &middot; Detect AI-generated content</p>
        </>}
      </div>
    </div>
  );
}
