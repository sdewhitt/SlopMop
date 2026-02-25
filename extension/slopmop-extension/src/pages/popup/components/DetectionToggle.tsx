import React from 'react';

interface DetectionToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export default function DetectionToggle({ enabled, onToggle }: DetectionToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors cursor-pointer ${
        enabled
          ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
          : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
      }`}
    >
      {enabled ? 'Pause Detection' : 'Enable Detection'}
    </button>
  );
}
