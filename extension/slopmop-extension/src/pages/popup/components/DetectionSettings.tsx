import React from 'react';
import Toggle from './Toggle';
import type { Settings } from '../types';

interface DetectionSettingsProps {
  settings: Settings;
  onUpdateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const SCAN_COMMENTS_LABELS: Record<Settings['scanComments'], string> = {
  off: 'Off',
  user_triggered: 'Manual',
  auto_top_n: 'Auto',
};

export default function DetectionSettings({ settings, onUpdateSetting }: DetectionSettingsProps) {
  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Detection</p>
      <div className="bg-gray-800 rounded-lg px-3 space-y-0 divide-y divide-gray-700">
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
        <Toggle
          checked={settings.scanImages}
          onChange={(v) => onUpdateSetting('scanImages', v)}
          label="Scan Images"
          description="Analyze images in posts (coming soon)"
        />
        <Toggle
          checked={settings.automaticScanning}
          onChange={(v) => onUpdateSetting('automaticScanning', v)}
          label="Automatic Scanning"
          description="When off, posts show a Detect Now button"
        />
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-200 mb-1.5">Comment Scanning</p>
          <div className="flex gap-1.5">
            {(['off', 'user_triggered', 'auto_top_n'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onUpdateSetting('scanComments', mode)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  settings.scanComments === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                }`}
              >
                {SCAN_COMMENTS_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-200 mb-1.5">Sensitivity</p>
          <div className="flex gap-1.5">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                onClick={() => onUpdateSetting('sensitivity', level)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                  settings.sensitivity === level
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-200 mb-1.5">Highlight Style</p>
          <div className="flex gap-1.5">
            {(['badge', 'border', 'dim'] as const).map((style) => (
              <button
                key={style}
                onClick={() => onUpdateSetting('highlightStyle', style)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                  settings.highlightStyle === style
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
        <div className="py-2.5">
          <p className="text-sm font-medium text-gray-200 mb-1.5">Detail Mode</p>
          <div className="flex gap-1.5">
            {(['simple', 'detailed'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onUpdateSetting('uiMode', mode)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                  settings.uiMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
