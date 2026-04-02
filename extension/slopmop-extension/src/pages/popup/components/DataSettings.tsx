import React from 'react';

interface DataSettingsProps {
  onResetStats: () => void;
  onResetSettings: () => void;
}

export default function DataSettings({ onResetStats, onResetSettings }: DataSettingsProps) {
  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Data</p>
      <div className="flex gap-2">
        <button
          onClick={onResetStats}
          className="flex-1 py-2 rounded-lg text-xs font-medium bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white transition-colors cursor-pointer"
        >
          Reset Stats
        </button>
        <button
          onClick={onResetSettings}
          className="flex-1 py-2 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25 transition-colors cursor-pointer"
        >
          Reset All
        </button>
      </div>
    </section>
  );
}
