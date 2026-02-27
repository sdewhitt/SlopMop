import React from 'react';
import Toggle from './Toggle';
import type { Settings } from '../types';

interface DetectionSettingsProps {
  settings: Settings;
  onUpdateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

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
      </div>
    </section>
  );
}
