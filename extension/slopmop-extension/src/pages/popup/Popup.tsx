import React, { useEffect, useState } from 'react';
import logo from '@assets/img/logo.svg';
import browser from 'webextension-polyfill';

interface Stats {
  postsScanned: number;
  aiDetected: number;
}

export default function Popup() {
  const [enabled, setEnabled] = useState(true);
  const [stats, setStats] = useState<Stats>({ postsScanned: 0, aiDetected: 0 });

  useEffect(() => {
    browser.storage.local.get(['enabled', 'postsScanned', 'aiDetected']).then((result) => {
      if (result.enabled !== undefined) setEnabled(result.enabled as boolean);
      setStats({
        postsScanned: (result.postsScanned as number) || 0,
        aiDetected: (result.aiDetected as number) || 0,
      });
    });
  }, []);

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    browser.storage.local.set({ enabled: next });
  };

  const openSettings = () => {
    browser.runtime.openOptionsPage();
  };

  return (
    <div className="w-full h-full bg-gray-900 text-white p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <img src={logo} className="h-9 w-9" alt="SlopMop logo" />
        <h1 className="text-lg font-bold tracking-tight">SlopMop</h1>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
          enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {enabled ? 'Active' : 'Paused'}
        </span>
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
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-400">{stats.postsScanned}</p>
          <p className="text-[11px] text-gray-400 mt-1">Posts Scanned</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-400">{stats.aiDetected}</p>
          <p className="text-[11px] text-gray-400 mt-1">AI Detected</p>
        </div>
      </div>

      {/* Footer / Settings link */}
      <button
        onClick={openSettings}
        className="mt-auto flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Settings
      </button>
    </div>
  );
}
