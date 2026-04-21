import React from 'react';
import Toggle from './Toggle';
import ThemeToggle from './ThemeToggle';
import type { Settings } from '../types';
import type { DetectionLanguageCode } from '@src/utils/userSettings';

const TEXT_LANG_OPTIONS: { code: DetectionLanguageCode; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
];

interface DetectionSettingsProps {
  settings: Settings;
  onUpdateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** When true, automatic scanning is paused by low battery (saved toggle may still be on). */
  batteryThrottleActive?: boolean;
  /** Local-only: auto low-battery mode is active (same thresholds as automatic pause). */
  batteryAutoLowBatteryActive?: boolean;
}

const SCAN_COMMENTS_LABELS: Record<Settings['scanComments'], string> = {
  off: 'Off',
  user_triggered: 'Manual',
  auto_top_n: 'Auto',
};

const BADGE_SIZE_LABELS: Record<Settings['badgeSize'], string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

const THEME_LABELS: Record<Settings['detectionTheme'], string> = {
  default: 'Default',
  high_contrast: 'High Contrast',
  minimal: 'Minimal',
};

const POSITION_LABELS: Record<Settings['badgePosition'], string> = {
  top_right: 'Top-right',
  top_left: 'Top-left',
  bottom_right: 'Bottom-right',
};

export default function DetectionSettings({
  settings,
  onUpdateSetting,
  batteryThrottleActive = false,
  batteryAutoLowBatteryActive = false,
}: DetectionSettingsProps) {
  const effectiveLowBattery = settings.lowBatteryMode || batteryAutoLowBatteryActive;

  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Detection</p>
      <div className="bg-white dark:bg-gray-800 rounded-lg px-3 space-y-0 divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-transparent">
        <Toggle
          checked={settings.showNotifications}
          onChange={(v) => onUpdateSetting('showNotifications', v)}
          label="Show Notifications"
          description="Alert when AI content is detected"
        />
        <Toggle
          checked={settings.scanText}
          onChange={(v) => onUpdateSetting('scanText', v)}
          label="Scan Text"
          description="Analyze text content in posts"
        />
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Text detection languages</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Only run text detection for checked languages (auto-detected). Uncheck all to skip text detection.
          </p>
          <div className="flex flex-col gap-2 pl-0.5">
            {TEXT_LANG_OPTIONS.map(({ code, label }) => (
              <label
                key={code}
                className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200"
              >
                <input
                  type="checkbox"
                  checked={settings.detectionLanguages.includes(code)}
                  onChange={() => {
                    const cur = settings.detectionLanguages;
                    const on = cur.includes(code);
                    const next = on ? cur.filter((c) => c !== code) : [...cur, code];
                    onUpdateSetting('detectionLanguages', next);
                  }}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <Toggle
          checked={settings.scanImages}
          onChange={(v) => onUpdateSetting('scanImages', v)}
          label="Scan Images"
          description="Analyze images in posts (coming soon)"
        />
        <Toggle
          checked={effectiveLowBattery}
          disabled={batteryAutoLowBatteryActive && !settings.lowBatteryMode}
          onChange={(v) => onUpdateSetting('lowBatteryMode', v)}
          label="Low battery mode"
          description="Manual power saving: turns off automatic scanning until you turn this off. Separate from automatic pause when the battery is low (see banner below)."
        />
        <div className="px-3 py-2 -mt-1 border-b border-gray-200 dark:border-gray-700">
          <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              checked={settings.lowBatteryModeAutoWhenBatteryLow}
              onChange={(e) => onUpdateSetting('lowBatteryModeAutoWhenBatteryLow', e.target.checked)}
              className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
            />
            <span>
              <span className="font-medium">Turn on automatically when the battery is low</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                Uses the same thresholds as automatic pause below. Your saved Automatic Scanning preference is not
                changed; when charge is above the resume threshold (or you plug in), behavior returns to your saved
                settings.
              </span>
            </span>
          </label>
          {batteryAutoLowBatteryActive && !settings.lowBatteryMode && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 pl-6 leading-snug" role="status">
              Low battery mode is on automatically until the battery recovers or you turn off the option above.
            </p>
          )}
        </div>
        <Toggle
          checked={effectiveLowBattery ? false : settings.automaticScanning}
          disabled={effectiveLowBattery}
          onChange={(v) => onUpdateSetting('automaticScanning', v)}
          label="Automatic Scanning"
          description="When off, posts show a Detect Now button"
        />
        {batteryThrottleActive && settings.automaticScanning && !effectiveLowBattery && (
          <div
            className="px-3 py-2.5 bg-amber-50 dark:bg-amber-500/10 border-t border-amber-200/80 dark:border-amber-600/40"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">
                  Power saving mode
                </p>
                <p className="mt-1 text-[11px] leading-snug text-amber-900/90 dark:text-amber-100/85">
                  Automatic detection is paused because the battery is low and the device is not charging. Posts
                  will show Detect Now until you plug in or the battery level rises above the resume threshold.
                </p>
              </div>
            </div>
          </div>
        )}
        <Toggle
          checked={settings.factCheck}
          onChange={(v) => onUpdateSetting('factCheck', v)}
          label="Show Fact check"
          description="When on, Fact check appears beside Detect Now on posts (uses your API)"
        />
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Comment Scanning</p>
          <div className="flex gap-1.5">
            {(['off', 'user_triggered', 'auto_top_n'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onUpdateSetting('scanComments', mode)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  settings.scanComments === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {SCAN_COMMENTS_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Badge Size</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Controls the in-page indicator size across supported platforms.
          </p>
          <div className="flex gap-1.5">
            {(['small', 'medium', 'large'] as const).map((size) => (
              <button
                key={size}
                onClick={() => onUpdateSetting('badgeSize', size)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  settings.badgeSize === size
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {BADGE_SIZE_LABELS[size]}
              </button>
            ))}
          </div>
        </div>
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Badge Position</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Choose where detection badges appear on posts.
          </p>
          <div className="flex gap-1.5">
            {(['top_right', 'top_left', 'bottom_right'] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => onUpdateSetting('badgePosition', pos)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  settings.badgePosition === pos
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {POSITION_LABELS[pos]}
              </button>
            ))}
          </div>
        </div>
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Indicator Theme</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Choose how detection indicators are colored.
          </p>
          <div className="flex gap-1.5">
            {(['default', 'high_contrast', 'minimal'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => onUpdateSetting('detectionTheme', theme)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  settings.detectionTheme === theme
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {THEME_LABELS[theme]}
              </button>
            ))}
          </div>
        </div>
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Sensitivity</p>
          <div className="flex gap-1.5">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                onClick={() => onUpdateSetting('sensitivity', level)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                  settings.sensitivity === level
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Highlight Style</p>
          <div className="flex gap-1.5">
            {(['badge', 'border', 'dim'] as const).map((style) => (
              <button
                key={style}
                onClick={() => onUpdateSetting('highlightStyle', style)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                  settings.highlightStyle === style
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
        <Toggle
          checked={settings.highlightSegments}
          onChange={(v) => onUpdateSetting('highlightSegments', v)}
          label="Highlight segments that triggered detection"
          description="Show which parts of the text contributed most to the AI score"
        />
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Detail Mode</p>
          <div className="flex gap-1.5">
            {(['simple', 'detailed'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onUpdateSetting('uiMode', mode)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                  settings.uiMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="py-2.5 border-t border-gray-200 dark:border-gray-700">
          <ThemeToggle embedded />
        </div>
      </div>
    </section>
  );
}
