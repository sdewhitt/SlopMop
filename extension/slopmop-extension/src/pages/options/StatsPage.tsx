import React, { useCallback, useEffect, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';

Chart.register(
  DoughnutController,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

// ── Types ─────────────────────────────────────────────────────────

interface StatsData {
  postsScanned: number;
  aiDetected: number;
  postsProcessing: number;
  platformCounts: Record<string, number>;
}

export interface StatsPageProps {
  uid: string | null;
}

// ── Constants ─────────────────────────────────────────────────────

const EMPTY_STATS: StatsData = {
  postsScanned: 0,
  aiDetected: 0,
  postsProcessing: 0,
  platformCounts: {},
};

const PLATFORM_LABELS: Record<string, string> = {
  'reddit.com': 'Reddit',
  'twitter.com': 'X (Twitter)',
  'x.com': 'X',
  'instagram.com': 'Instagram',
  'linkedin.com': 'LinkedIn',
  'facebook.com': 'Facebook',
};

const PLATFORM_COLORS = [
  '#f97316',
  '#3b82f6',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#22c55e',
  '#eab308',
  '#ef4444',
];

// ── Helpers ───────────────────────────────────────────────────────

function statsKeys(uid: string) {
  return {
    postsScanned: `postsScanned:${uid}`,
    aiDetected: `aiDetected:${uid}`,
    postsProcessing: `postsProcessing:${uid}`,
    platformCounts: `platformCounts:${uid}`,
  };
}

function platformLabel(hostname: string): string {
  return PLATFORM_LABELS[hostname] ?? hostname;
}

function computeAiRate(stats: StatsData): number {
  if (stats.postsScanned === 0) return 0;
  return Math.round((stats.aiDetected / stats.postsScanned) * 100);
}

// ── StatsPage ─────────────────────────────────────────────────────

export default function StatsPage({ uid }: StatsPageProps) {
  const [stats, setStats] = useState<StatsData>(EMPTY_STATS);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  const donutCanvasRef = useRef<HTMLCanvasElement>(null);
  const barCanvasRef = useRef<HTMLCanvasElement>(null);
  const donutChartRef = useRef<Chart | null>(null);
  const barChartRef = useRef<Chart | null>(null);

  // ── Load initial stats ──────────────────────────────────────────
  const loadStats = useCallback(async () => {
    if (!uid) {
      setStats(EMPTY_STATS);
      return;
    }
    const keys = statsKeys(uid);
    const result = await browser.storage.local.get(Object.values(keys));
    setStats({
      postsScanned:
        typeof result[keys.postsScanned] === 'number' ? (result[keys.postsScanned] as number) : 0,
      aiDetected:
        typeof result[keys.aiDetected] === 'number' ? (result[keys.aiDetected] as number) : 0,
      postsProcessing:
        typeof result[keys.postsProcessing] === 'number'
          ? (result[keys.postsProcessing] as number)
          : 0,
      platformCounts:
        (result[keys.platformCounts] as Record<string, number> | undefined) ?? {},
    });
  }, [uid]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // ── Reactive storage.onChanged listener ───────────────────────
  useEffect(() => {
    if (!uid) return;
    const keys = statsKeys(uid);
    const watched = new Set(Object.values(keys));

    const handler = (
      changes: Record<string, browser.Storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      if (!Object.keys(changes).some((k) => watched.has(k))) return;

      setStats((prev) => {
        const next = { ...prev, platformCounts: { ...prev.platformCounts } };
        if (keys.postsScanned in changes) {
          const v = changes[keys.postsScanned].newValue;
          if (typeof v === 'number') next.postsScanned = v;
        }
        if (keys.aiDetected in changes) {
          const v = changes[keys.aiDetected].newValue;
          if (typeof v === 'number') next.aiDetected = v;
        }
        if (keys.postsProcessing in changes) {
          const v = changes[keys.postsProcessing].newValue;
          if (typeof v === 'number') next.postsProcessing = v;
        }
        if (keys.platformCounts in changes) {
          const v = changes[keys.platformCounts].newValue;
          next.platformCounts = (v as Record<string, number>) ?? {};
        }
        return next;
      });
    };

    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
  }, [uid]);

  // ── Donut chart: create once ──────────────────────────────────
  useEffect(() => {
    const canvas = donutCanvasRef.current;
    if (!canvas) return;

    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['AI Detected', 'Human'],
        datasets: [
          {
            data: [0, 0],
            backgroundColor: ['rgba(239,68,68,0.85)', 'rgba(34,197,94,0.85)'],
            borderColor: ['#b91c1c', '#15803d'],
            borderWidth: 1,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '68%',
        animation: { duration: 400 },
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#9ca3af',
              font: { size: 12 },
              padding: 16,
              usePointStyle: true,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = (ctx.dataset.data as number[]).reduce(
                  (a, b) => (a as number) + (b as number),
                  0,
                ) as number;
                const val = ctx.raw as number;
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                return ` ${ctx.label}: ${val} (${pct}%)`;
              },
            },
          },
        },
      },
    });

    donutChartRef.current = chart;
    return () => {
      chart.destroy();
      donutChartRef.current = null;
    };
  }, []);

  // ── Donut chart: update data when stats change ────────────────
  useEffect(() => {
    const chart = donutChartRef.current;
    if (!chart) return;
    const ai = Math.max(0, stats.aiDetected);
    const human = Math.max(0, stats.postsScanned - stats.aiDetected);
    chart.data.datasets[0].data = [ai, human];
    chart.update('none');
  }, [stats.aiDetected, stats.postsScanned]);

  // ── Bar chart: create once ────────────────────────────────────
  useEffect(() => {
    const canvas = barCanvasRef.current;
    if (!canvas) return;

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Scans',
            data: [],
            backgroundColor: [],
            borderRadius: 6,
            maxBarThickness: 52,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration: 400 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y;
                return ` ${v} scan${v !== 1 ? 's' : ''}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: '#9ca3af',
              precision: 0,
              stepSize: 1,
            },
            grid: { color: 'rgba(55,65,81,0.6)' },
          },
          x: {
            ticks: { color: '#9ca3af', font: { size: 11 } },
            grid: { display: false },
          },
        },
      },
    });

    barChartRef.current = chart;
    return () => {
      chart.destroy();
      barChartRef.current = null;
    };
  }, []);

  // ── Bar chart: update data when platformCounts changes ────────
  useEffect(() => {
    const chart = barChartRef.current;
    if (!chart) return;

    const entries = Object.entries(stats.platformCounts).sort(([, a], [, b]) => b - a);
    chart.data.labels = entries.map(([host]) => platformLabel(host));
    chart.data.datasets[0].data = entries.map(([, count]) => count);
    (chart.data.datasets[0] as Record<string, unknown>).backgroundColor = entries.map(
      (_, i) => PLATFORM_COLORS[i % PLATFORM_COLORS.length],
    );
    chart.update('none');
  }, [stats.platformCounts]);

  // ── Reset stats ───────────────────────────────────────────────
  const handleResetClick = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    void confirmReset();
  };

  const confirmReset = async () => {
    if (!uid) return;
    setResetting(true);
    setResetConfirm(false);
    try {
      await browser.runtime.sendMessage({ type: 'SLOPMOP_RESET_STATS', uid });
      setStats(EMPTY_STATS);
    } catch (err) {
      console.error('[SlopMop] Failed to reset stats', err);
    } finally {
      setResetting(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────
  const humanCount = Math.max(0, stats.postsScanned - stats.aiDetected);
  const aiRate = computeAiRate(stats);
  const hasData = stats.postsScanned > 0;
  const hasPlatformData = Object.keys(stats.platformCounts).length > 0;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* ── Overview cards ── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Posts Scanned" value={stats.postsScanned} color="text-blue-400" />
          <StatCard label="AI Detected" value={stats.aiDetected} color="text-red-400" />
          <StatCard label="Human" value={humanCount} color="text-green-400" />
          <StatCard label="AI Rate" value={`${aiRate}%`} color="text-amber-400" />
        </div>
        {stats.postsProcessing > 0 && (
          <p className="mt-2 text-xs text-gray-500" role="status">
            {stats.postsProcessing} scan{stats.postsProcessing !== 1 ? 's' : ''} in progress…
          </p>
        )}
      </section>

      {/* ── AI vs Human donut ── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          AI vs Human
        </h2>
        <div className="bg-gray-900 rounded-xl p-5">
          {/* Canvas always in DOM; flex row hidden via display so Chart.js can init on mount */}
          <div className="flex items-center gap-4" style={{ display: hasData ? 'flex' : 'none' }}>
            <div className="w-32 shrink-0">
              <canvas ref={donutCanvasRef} data-testid="donut-chart" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-4xl font-bold tabular-nums text-red-400">{aiRate}%</span>
              <span className="text-xs text-gray-500">AI Rate</span>
            </div>
          </div>
          {!hasData && (
            <EmptyState message="No detections yet. Browse a supported site to start scanning." />
          )}
        </div>
      </section>

      {/* ── Per-platform bar chart ── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Per-Platform Breakdown
        </h2>
        <div className="bg-gray-900 rounded-xl p-5">
          <canvas
            ref={barCanvasRef}
            data-testid="bar-chart"
            style={{ display: hasPlatformData ? 'block' : 'none' }}
          />
          {!hasPlatformData && (
            <EmptyState message="No platform data yet. Detections will appear here by site." />
          )}
        </div>
      </section>

      {/* ── Platform breakdown table (accessible text alternative) ── */}
      {hasPlatformData && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Platform Details
          </h2>
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <table className="w-full text-sm" aria-label="Per-platform scan counts">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">
                    Platform
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">
                    Scans
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.platformCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([host, count], i) => {
                    const share =
                      stats.postsScanned > 0
                        ? Math.round((count / stats.postsScanned) * 100)
                        : 0;
                    return (
                      <tr
                        key={host}
                        className={`border-b border-gray-800 last:border-0 ${
                          i % 2 === 0 ? '' : 'bg-gray-800/30'
                        }`}
                      >
                        <td className="px-4 py-2.5 text-gray-200">{platformLabel(host)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-300 font-medium">
                          {count}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{share}%</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Reset ── */}
      <section className="pb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Data
        </h2>
        <div className="bg-gray-900 rounded-xl p-4">
          {resetConfirm ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="text-sm text-gray-300">
                This will zero all counters. Detection history is unaffected.
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResetClick}
                  disabled={resetting}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {resetting ? 'Resetting…' : 'Yes, Reset'}
                </button>
                <button
                  type="button"
                  onClick={() => setResetConfirm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleResetClick}
                disabled={!uid || !hasData}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Reset Statistics
              </button>
              {!uid && (
                <p className="text-xs text-gray-500">Sign in to manage your statistics.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 text-center flex flex-col items-center justify-center min-h-[76px]">
      <p className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-1.5 leading-tight">{label}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}
