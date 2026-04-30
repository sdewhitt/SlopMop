import React from 'react';
import logo from '@assets/img/logo.svg';
import browser from 'webextension-polyfill';
import CloseButton from './CloseButton';

// Vite outputs an absolute path like "/assets/logo-hash.svg" which resolves
// correctly in the extension popup, but inside a content-script Shadow DOM
// it would resolve against the host page origin. Use the full extension URL.
const logoSrc = browser.runtime.getURL(logo.replace(/^\//, ''));

interface PopupHeaderProps {
  enabled: boolean;
  onSettingsClick: () => void;
  onHistoryClick: () => void;
  onStatsClick: () => void;
}

export default function PopupHeader({ enabled, onSettingsClick, onHistoryClick, onStatsClick }: PopupHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <img src={logoSrc} className="h-9 w-9" alt="SlopMop logo" />
      <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">SlopMop</h1>
      <span
        className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
          enabled ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-red-500/20 text-red-700 dark:text-red-400'
        }`}
      >
        {enabled ? 'Active' : 'Paused'}
      </span>
      {/* Stats button */}
      <button
        onClick={onStatsClick}
        className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer"
        aria-label="Statistics"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </button>
      {/* History button */}
      <button
        onClick={onHistoryClick}
        className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer"
        aria-label="Detection History"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {/* Settings button */}
      <button
        onClick={onSettingsClick}
        className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer"
        aria-label="Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      <CloseButton />
    </div>
  );
}
