import React, { useEffect, useState, useCallback } from 'react';
import browser from 'webextension-polyfill';
import type { HistoryEntry } from '@src/utils/detectionHistory';
import type { Verdict } from '@src/types/domain';

// ── Formatting helpers ────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today, ${timeStr}`;
  return (
    date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + timeStr
  );
}

function platformLabel(platform: string): string {
  if (platform.includes('reddit')) return 'Reddit';
  if (platform.includes('instagram')) return 'Instagram';
  if (platform.includes('twitter') || platform.includes('x.com')) return 'X';
  if (platform.includes('linkedin')) return 'LinkedIn';
  if (platform.includes('facebook')) return 'Facebook';
  if (platform.includes('youtube')) return 'YouTube';
  return platform;
}

function platformColor(platform: string): string {
  if (platform.includes('reddit')) return 'bg-orange-500/15 text-orange-400';
  if (platform.includes('instagram')) return 'bg-pink-500/15 text-pink-400';
  if (platform.includes('twitter') || platform.includes('x.com')) return 'bg-sky-500/15 text-sky-400';
  if (platform.includes('linkedin')) return 'bg-blue-500/15 text-blue-400';
  if (platform.includes('facebook')) return 'bg-blue-600/15 text-blue-300';
  if (platform.includes('youtube')) return 'bg-red-500/15 text-red-400';
  return 'bg-gray-500/15 text-gray-400';
}

function verdictLabel(verdict: Verdict): string {
  if (verdict === 'likely_ai') return 'Likely AI';
  if (verdict === 'likely_human') return 'Likely Human';
  return 'Uncertain';
}

function verdictColor(verdict: Verdict): string {
  if (verdict === 'likely_ai') return 'bg-red-500/15 text-red-400';
  if (verdict === 'likely_human') return 'bg-green-500/15 text-green-400';
  return 'bg-yellow-500/15 text-yellow-400';
}

// ── Entry card ────────────────────────────────────────────────────

interface EntryCardProps {
  entry: HistoryEntry;
  onTogglePin: (postId: string) => void;
}

function EntryCard({ entry, onTogglePin }: EntryCardProps) {
  const pct = Math.round(entry.confidence * 100);

  const handleOpenPost = () => {
    if (!entry.url) return;
    browser.runtime.sendMessage({ type: 'SLOPMOP_OPEN_URL', url: entry.url });
  };

  return (
    <li className="flex flex-col gap-2.5 p-4 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
      {/* Top row: platform + timestamp + verdict badge + pin */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${platformColor(entry.platform)}`}
          >
            {platformLabel(entry.platform)}
          </span>
          <span className="text-xs text-gray-500 truncate">
            {formatTimestamp(entry.savedAtMs)}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${verdictColor(entry.verdict)}`}
          >
            {verdictLabel(entry.verdict)} &middot; {pct}%
          </span>

          {/* Pin button */}
          <button
            onClick={() => onTogglePin(entry.postId)}
            title={entry.pinned ? 'Unpin entry' : 'Pin entry'}
            aria-label={entry.pinned ? 'Unpin entry' : 'Pin entry'}
            className={`transition-colors ${
              entry.pinned
                ? 'text-yellow-400 hover:text-yellow-300'
                : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {/* Pin icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill={entry.pinned ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Snippet */}
      {entry.snippet ? (
        <p className="text-sm text-gray-300 leading-snug line-clamp-2 break-words">
          {entry.snippet}
        </p>
      ) : (
        <p className="text-sm text-gray-600 italic">No text content</p>
      )}

      {/* View post link */}
      <button
        onClick={handleOpenPost}
        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors self-start"
        aria-label="Open original post in new tab"
      >
        View original post
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </button>
    </li>
  );
}

// ── Empty state ───────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-400">No History Found</p>
        <p className="text-xs text-gray-600 mt-1 max-w-xs">
          Detection results appear here after posts are analyzed. Results are kept
          for 24 hours.
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await browser.runtime.sendMessage({
        type: 'SLOPMOP_GET_HISTORY',
      })) as { success: boolean; data?: HistoryEntry[] };

      if (res?.success && Array.isArray(res.data)) {
        // Newest first
        setEntries(res.data.slice().reverse());
      }
    } catch (err) {
      console.error('[SlopMop] Failed to load history', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleClear = async () => {
    // Two-step confirmation: first click shows confirm, second click executes
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setClearing(true);
    setConfirmClear(false);
    try {
      await browser.runtime.sendMessage({ type: 'SLOPMOP_CLEAR_HISTORY' });
      await loadHistory();
    } catch (err) {
      console.error('[SlopMop] Failed to clear history', err);
    } finally {
      setClearing(false);
    }
  };

  const handleTogglePin = async (postId: string) => {
    try {
      await browser.runtime.sendMessage({ type: 'SLOPMOP_TOGGLE_PIN', postId });
      await loadHistory();
    } catch (err) {
      console.error('[SlopMop] Failed to toggle pin', err);
    }
  };

  const pinned = entries.filter((e) => e.pinned);
  const recent = entries.filter((e) => !e.pinned);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Detection History</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {entries.length > 0
              ? `${entries.length} result${entries.length !== 1 ? 's' : ''} · Last 24 hours`
              : 'Last 24 hours · auto-deleted after 24h'}
          </p>
        </div>

        {entries.some((e) => !e.pinned) && (
          <button
            onClick={handleClear}
            disabled={clearing}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
              confirmClear
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {clearing ? 'Clearing…' : confirmClear ? 'Confirm clear?' : 'Clear History'}
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-12">Loading…</p>
      ) : entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {/* Pinned section */}
          {pinned.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                Pinned
              </h3>
              <ul className="space-y-3">
                {pinned.map((entry) => (
                  <EntryCard
                    key={entry.postId}
                    entry={entry}
                    onTogglePin={handleTogglePin}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* Recent section */}
          {recent.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                  Recent
                </h3>
              )}
              <ul className="space-y-3">
                {recent.map((entry) => (
                  <EntryCard
                    key={entry.postId}
                    entry={entry}
                    onTogglePin={handleTogglePin}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
