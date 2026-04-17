import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import browser from 'webextension-polyfill';
import React from 'react';

let storageChangedCallbacks: Array<
  (changes: Record<string, unknown>, areaName?: string) => void
> = [];

function fireStorageLocalChanged(changes: Record<string, unknown>) {
  for (const cb of storageChangedCallbacks) {
    cb(changes, 'local');
  }
}

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn((cb: (changes: Record<string, unknown>, areaName?: string) => void) => {
          storageChangedCallbacks.push(cb);
        }),
        removeListener: vi.fn((cb: (changes: Record<string, unknown>, areaName?: string) => void) => {
          storageChangedCallbacks = storageChangedCallbacks.filter((listener) => listener !== cb);
        }),
      },
    },
    identity: {
      getRedirectURL: vi.fn(() => 'https://mock-extension-id.chromiumapp.org/'),
      launchWebAuthFlow: vi.fn().mockResolvedValue(
        'https://mock-extension-id.chromiumapp.org/#id_token=mock-id-token',
      ),
    },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ url: 'https://reddit.com/r/test' }]),
    },
  },
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  setPersistence: vi.fn().mockResolvedValue(undefined),
  indexedDBLocalPersistence: {},
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: vi.fn(() => vi.fn()),
}));

vi.mock('../lib/firestoreProxy', () => ({
  getOrCreateUserSettings: vi.fn().mockResolvedValue({
    settings: {
      sensitivity: 'medium',
      highlightStyle: 'badge',
      showNotifications: true,
      automaticScanning: false,
      platforms: {
        twitter: true,
        reddit: true,
        facebook: true,
        youtube: true,
        linkedin: true,
        instagram: true,
      },
      enabled: true,
      scanText: true,
      scanImages: false,
      scanComments: 'auto_top_n',
      uiMode: 'simple',
      badgeSize: 'medium',
  detectionTheme: 'default',
      accessibilityMode: false,
      highlightSegments: true,
      factCheck: true,
      detectionLanguages: ['eng', 'spa', 'fra'],
    },
    stats: { postsScanned: 0, aiDetected: 0, postsProcessing: 0 },
    ignoredSites: [],
  }),
  updateDetectionSettings: vi.fn().mockResolvedValue(undefined),
  resetStats: vi.fn().mockResolvedValue(undefined),
  resetSettings: vi.fn().mockResolvedValue(undefined),
  setIgnoredSitesFirestore: vi.fn().mockResolvedValue(undefined),
}));

import Popup from '@pages/popup/Popup';
import { AuthProvider } from '../hooks/useAuth';
import { ThemeProvider } from '../hooks/useTheme';

function renderSignedInWithStorage(overrides: Record<string, unknown>) {
  (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
    slopmopUser: { uid: 'test-uid', email: 'test@example.com' },
    ...overrides,
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <Popup />
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe('Popup fact-check panel (component)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageChangedCallbacks = [];
    (browser.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (changes: Record<string, unknown>, areaName?: string) => void) => {
        storageChangedCallbacks.push(cb);
      },
    );
    (browser.storage.onChanged.removeListener as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (changes: Record<string, unknown>, areaName?: string) => void) => {
        storageChangedCallbacks = storageChangedCallbacks.filter((listener) => listener !== cb);
      },
    );
  });

  it('shows claim, verdict · source, and source link after a successful fact-check payload in storage', async () => {
    renderSignedInWithStorage({
      lastFactCheckResult: {
        postId: 't3_abc',
        items: [
          {
            claim: 'Moon missions returned lunar samples.',
            verdict: 'Mostly true',
            source: 'NASA fact sheet',
            url: 'https://example.com/article',
          },
        ],
      },
    });

    expect(await screen.findByText('Fact check (ClaimReview search)')).toBeInTheDocument();
    expect(screen.getByText('Moon missions returned lunar samples.')).toBeInTheDocument();
    expect(screen.getByText(/Mostly true · NASA fact sheet/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Open source article' });
    expect(link).toHaveAttribute('href', 'https://example.com/article');
  });

  it('shows API error without crashing; a later success clears error and does not leave stale items from a prior success', async () => {
    renderSignedInWithStorage({
      lastFactCheckError: {
        postId: 't3_x',
        message: 'HTTP 500',
        code: 'error',
      },
    });

    expect(await screen.findByText('HTTP 500')).toBeInTheDocument();

    await act(async () => {
      fireStorageLocalChanged({
        lastFactCheckResult: {
          newValue: {
            postId: 't3_x',
            items: [
              {
                claim: 'Recovery claim after error.',
                verdict: 'Unverified',
                source: 'News desk',
                url: 'https://example.com/recovery',
              },
            ],
          },
          oldValue: null,
        },
        lastFactCheckError: {
          newValue: null,
          oldValue: { postId: 't3_x', message: 'HTTP 500', code: 'error' },
        },
      });
    });

    expect(screen.queryByText('HTTP 500')).not.toBeInTheDocument();
    expect(screen.getByText('Recovery claim after error.')).toBeInTheDocument();
    expect(screen.getByText(/Unverified · News desk/)).toBeInTheDocument();
  });

  it('shows rate-limit copy from storage (single client attempt is asserted in api-fact-check)', async () => {
    renderSignedInWithStorage({
      lastFactCheckError: {
        postId: 't3_rl',
        message: 'Rate limited. Try again later.',
        code: 'rate_limit',
      },
    });

    expect(await screen.findByText('Rate limited. Try again later.')).toBeInTheDocument();
  });
});
