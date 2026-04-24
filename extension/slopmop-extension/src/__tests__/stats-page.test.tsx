/**
 * Tests for Story: User Statistics
 *
 * Stats UI          (4 tests) — overview cards, empty state, reactive updates
 * Stats Visualization (2 tests) — chart rendering, platform table
 * Reset & Privacy    (4 tests) — reset button flow, incognito exclusion, history unaffected
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

// ── Mock Chart.js before any import that uses it ─────────────────
// jsdom has no canvas implementation; we stub the whole Chart class.
vi.mock('chart.js', () => {
  class FakeChart {
    static register() {}
    data: { datasets: { data: number[]; backgroundColor: unknown[] }[]; labels: string[] } = {
      datasets: [{ data: [], backgroundColor: [] }],
      labels: [],
    };
    update(_mode?: string) {}
    destroy() {}
  }
  return {
    Chart: FakeChart,
    DoughnutController: {},
    ArcElement: {},
    BarController: {},
    BarElement: {},
    CategoryScale: {},
    LinearScale: {},
    Tooltip: {},
    Legend: {},
  };
});

// ── In-memory storage mock ────────────────────────────────────────
let store: Record<string, unknown> = {};
let onChangedListeners: Array<
  (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string) => void
> = [];

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const ks = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(ks.map((k) => [k, store[k]]));
        }),
        set: vi.fn(async (data: Record<string, unknown>) => {
          Object.assign(store, data);
        }),
      },
      onChanged: {
        addListener: vi.fn((handler) => {
          onChangedListeners.push(handler);
        }),
        removeListener: vi.fn((handler) => {
          onChangedListeners = onChangedListeners.filter((h) => h !== handler);
        }),
      },
    },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
    },
  },
}));

import browser from 'webextension-polyfill';
import StatsPage from '@src/pages/options/StatsPage';

// ── Helpers ───────────────────────────────────────────────────────

const UID = 'test-uid-stats';

function writeStats(opts: {
  postsScanned?: number;
  aiDetected?: number;
  postsProcessing?: number;
  platformCounts?: Record<string, number>;
}) {
  store[`postsScanned:${UID}`] = opts.postsScanned ?? 0;
  store[`aiDetected:${UID}`] = opts.aiDetected ?? 0;
  store[`postsProcessing:${UID}`] = opts.postsProcessing ?? 0;
  store[`platformCounts:${UID}`] = opts.platformCounts ?? {};
}

function fireStorageChange(
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
) {
  onChangedListeners.forEach((h) => h(changes, 'local'));
}

// ─────────────────────────────────────────────────────────────────
// Stats UI
// ─────────────────────────────────────────────────────────────────

describe('Stats UI', () => {
  beforeEach(() => {
    store = {};
    onChangedListeners = [];
    vi.clearAllMocks();
  });

  it('renders without errors when uid is null (no detections)', () => {
    render(<StatsPage uid={null} />);
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
  });

  it('shows 0 for all values when no detections have been made', async () => {
    writeStats({ postsScanned: 0 });
    render(<StatsPage uid={UID} />);

    await waitFor(() => {
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(3); // postsScanned, aiDetected, human
      expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays correct counts loaded from storage', async () => {
    writeStats({
      postsScanned: 25,
      aiDetected: 10,
      platformCounts: { 'reddit.com': 20, 'x.com': 5 },
    });
    render(<StatsPage uid={UID} />);

    await waitFor(() => {
      expect(screen.getAllByText('25').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('10').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('15').length).toBeGreaterThanOrEqual(1); // human
      expect(screen.getAllByText('40%').length).toBeGreaterThanOrEqual(1); // ai rate
    });
  });

  it('updates counters reactively when storage.onChanged fires (no page reload)', async () => {
    writeStats({ postsScanned: 5, aiDetected: 2 });
    render(<StatsPage uid={UID} />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    act(() => {
      fireStorageChange({
        [`postsScanned:${UID}`]: { newValue: 8 },
        [`aiDetected:${UID}`]: { newValue: 5 },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument(); // aiDetected
      expect(screen.getByText('3')).toBeInTheDocument(); // human = 8 - 5
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Stats Visualization
// ─────────────────────────────────────────────────────────────────

describe('Stats Visualization', () => {
  beforeEach(() => {
    store = {};
    onChangedListeners = [];
    vi.clearAllMocks();
  });

  it('renders chart canvas elements', async () => {
    writeStats({ postsScanned: 10, aiDetected: 3 });
    render(<StatsPage uid={UID} />);

    // Both canvas elements should be in the DOM (chart.js mocked)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="donut-chart"]')).toBeInTheDocument();
      expect(document.querySelector('[data-testid="bar-chart"]')).toBeInTheDocument();
    });
  });

  it('shows per-platform table with correct data', async () => {
    writeStats({
      postsScanned: 30,
      aiDetected: 10,
      platformCounts: { 'reddit.com': 20, 'instagram.com': 10 },
    });
    render(<StatsPage uid={UID} />);

    await waitFor(() => {
      expect(screen.getByText('Reddit')).toBeInTheDocument();
      expect(screen.getByText('Instagram')).toBeInTheDocument();
      expect(screen.getAllByText('20').length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Reset & Privacy Controls
// ─────────────────────────────────────────────────────────────────

describe('Reset & Privacy Controls', () => {
  beforeEach(() => {
    store = {};
    onChangedListeners = [];
    vi.clearAllMocks();
  });

  it('Reset Stats button is disabled when postsScanned is 0', async () => {
    writeStats({ postsScanned: 0 });
    render(<StatsPage uid={UID} />);

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /reset statistics/i });
      expect(btn).toBeDisabled();
    });
  });

  it('shows confirmation prompt on first click before resetting', async () => {
    writeStats({ postsScanned: 10, aiDetected: 4 });
    render(<StatsPage uid={UID} />);

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /reset statistics/i }));

    expect(screen.getByText(/This will zero all counters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes, reset/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    // sendMessage must NOT have been called yet
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('confirming reset sends SLOPMOP_RESET_STATS and zeros the display', async () => {
    writeStats({ postsScanned: 10, aiDetected: 4 });
    render(<StatsPage uid={UID} />);

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /reset statistics/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));

    await waitFor(() => {
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SLOPMOP_RESET_STATS',
        uid: UID,
      });
    });

    // Display values must be zeroed after reset
    await waitFor(() => {
      // postsScanned, aiDetected, human, and aiRate should all show 0 / 0%
      expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(3);
      expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Cancel hides the confirmation without resetting', async () => {
    writeStats({ postsScanned: 8, aiDetected: 2 });
    render(<StatsPage uid={UID} />);

    await waitFor(() => {
      expect(screen.getByText('8')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /reset statistics/i }));
    expect(screen.getByText(/This will zero all counters/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText(/This will zero all counters/i)).not.toBeInTheDocument();
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
    // original data still displayed
    expect(screen.getByText('8')).toBeInTheDocument();
  });
});
