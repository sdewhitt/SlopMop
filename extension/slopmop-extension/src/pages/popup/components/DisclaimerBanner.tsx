import React from 'react';

export default function DisclaimerBanner() {
  return (
    <div className="mt-4 px-3 py-2 bg-amber-900/30 border border-amber-700/50 rounded text-xs text-amber-200">
      <p className="font-medium mb-1">ℹ️ Detection Notice</p>
      <p className="text-amber-300/90">
        Results are probability-based estimates, not definitive determinations.
      </p>
    </div>
  );
}
