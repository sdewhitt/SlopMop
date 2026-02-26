import React from 'react';
import type { Stats } from '../types';

interface StatsGridProps {
  stats: Stats;
}

export default function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-gray-800 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-blue-400">{stats.postsScanned}</p>
        <p className="text-[11px] text-gray-400 mt-1">Posts Scanned</p>
      </div>
      <div className="bg-gray-800 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-purple-400">{stats.postsProcessing}</p>
        <p className="text-[11px] text-gray-400 mt-1">Processing</p>
      </div>
      <div className="bg-gray-800 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-amber-400">{stats.aiDetected}</p>
        <p className="text-[11px] text-gray-400 mt-1">AI Detected</p>
      </div>
    </div>
  );
}
