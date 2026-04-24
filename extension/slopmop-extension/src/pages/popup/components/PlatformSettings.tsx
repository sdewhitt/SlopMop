import React from 'react';
import Toggle from './Toggle';
import type { Settings } from '../types';

interface PlatformSettingsProps {
  platforms: Settings['platforms'];
  onUpdatePlatform: (platform: keyof Settings['platforms'], value: boolean) => void;
}

export default function PlatformSettings({ platforms, onUpdatePlatform }: PlatformSettingsProps) {
  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Platforms</p>
      <div className="bg-white dark:bg-gray-800 rounded-lg px-3 border border-gray-200 dark:border-transparent overflow-hidden">
        {(Object.keys(platforms) as Array<keyof Settings['platforms']>).map((p) => (
          <div
            key={p}
            className="settings-search-block border-t border-gray-200 dark:border-gray-700 first:border-t-0"
            data-search={`${p} social network site feed ${p === 'youtube' ? 'video' : ''}`}
          >
            <Toggle
              checked={platforms[p]}
              onChange={(v) => onUpdatePlatform(p, v)}
              label={p.charAt(0).toUpperCase() + p.slice(1)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
