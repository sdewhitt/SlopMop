import React, { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { Settings, Stats, defaultSettings } from './types';
import PopupHeader from './components/PopupHeader';
import DetectionToggle from './components/DetectionToggle';
import StatsGrid from './components/StatsGrid';
import DisclaimerBanner from './components/DisclaimerBanner';
import ConfidenceDisplay from './components/ConfidenceDisplay';
import SettingsHeader from './components/SettingsHeader';
import DetectionSettings from './components/DetectionSettings';
import PlatformSettings from './components/PlatformSettings';
import DataSettings from './components/DataSettings';

// When score is null, the confidence block is hidden until detection provides a score.
const confidenceScore: number | null = null;

export default function Popup() {
  const [view, setView] = useState<'home' | 'settings'>('home');
  const [enabled, setEnabled] = useState(true);
  const [stats, setStats] = useState<Stats>({ postsScanned: 0, aiDetected: 0, postsProcessing: 0 });
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    browser.storage.local
      .get(['enabled', 'postsScanned', 'aiDetected', 'postsProcessing', 'settings'])
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
      });
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
      <div className="w-full bg-gray-900 text-white flex flex-col overflow-hidden">
        <SettingsHeader saved={saved} onBack={() => setView('home')} />

        <div className="px-4 py-3 space-y-4 overflow-y-auto overscroll-none flex-1">
          <DetectionSettings settings={settings} onUpdateSetting={updateSetting} />

          <PlatformSettings platforms={settings.platforms} onUpdatePlatform={updatePlatform} />

          <DataSettings onResetStats={resetStats} onResetSettings={resetSettings} />
        </div>
      </div>
    );
  }

  // ── Home view ─────────────────────────────────────────────────
  return (
    <div className="w-full bg-gray-900 text-white p-4 flex flex-col gap-4 overflow-hidden overscroll-none">
      <PopupHeader enabled={enabled} onSettingsClick={() => setView('settings')} />

      <DetectionToggle enabled={enabled} onToggle={toggleEnabled} />

      <StatsGrid stats={stats} />

      <DisclaimerBanner />

      {confidenceScore != null && <ConfidenceDisplay confidenceScore={confidenceScore} />}
    </div>
  );
}
