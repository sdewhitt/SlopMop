import React from 'react';

interface SettingsHeaderProps {
  saved: boolean;
  onBack: () => void;
}

export default function SettingsHeader({ saved, onBack }: SettingsHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-800 shrink-0">
      <button
        onClick={onBack}
        className="text-gray-400 hover:text-white transition-colors cursor-pointer"
        aria-label="Back"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h2 className="text-sm font-semibold">Settings</h2>
      <span
        className={`ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full transition-opacity duration-300 bg-green-500/20 text-green-400 ${
          saved ? 'opacity-100' : 'opacity-0'
        }`}
      >
        Saved
      </span>
    </div>
  );
}
