import React from 'react';
import logo from '@assets/img/logo.svg';

export default function Popup() {
  return (
    <div className="absolute top-0 left-0 right-0 bottom-0 text-center h-full p-3 bg-gray-800">
      <header className="flex flex-col items-center justify-center text-white">
        <img src={logo} className="h-36 pointer-events-none animate-spin-slow" alt="logo" />
        <p>
          Slop Mop
        </p>
      </header>
      {/* Disclaimer - Always visible at top */}
      <div className="mt-4 px-3 py-2 bg-amber-900/30 border border-amber-700/50 rounded text-xs text-amber-200">
        <p className="font-medium mb-1">ℹ️ Detection Notice</p>
        <p className="text-amber-300/90">
          Results are probability-based estimates, not definitive determinations.
        </p>
      </div>
    </div>
  );
}
