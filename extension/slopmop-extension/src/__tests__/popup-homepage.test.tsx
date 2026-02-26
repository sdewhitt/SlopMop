import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import browser from 'webextension-polyfill';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    identity: {
      getRedirectURL: vi.fn(() => 'https://mock-extension-id.chromiumapp.org/'),
      launchWebAuthFlow: vi.fn().mockResolvedValue(
        'https://mock-extension-id.chromiumapp.org/#id_token=mock-id-token',
      ),
    },
  },
}));

let authStateCallback: ((user: unknown) => void) | null = null;

vi.mock('firebase/auth', () => {
  const GoogleAuthProvider = vi.fn(function () { return {}; });
  (GoogleAuthProvider as unknown as Record<string, unknown>).credential = vi.fn(() => ({}));
  return {
    getAuth: vi.fn(() => ({})),
    setPersistence: vi.fn().mockResolvedValue(undefined),
    browserLocalPersistence: {},
    GoogleAuthProvider,
    onAuthStateChanged: vi.fn((_auth: unknown, cb: (user: unknown) => void) => {
      authStateCallback = cb;
      return vi.fn();
    }),
    signInWithEmailAndPassword: vi.fn().mockResolvedValue({}),
    createUserWithEmailAndPassword: vi.fn().mockResolvedValue({}),
    signInWithCredential: vi.fn().mockResolvedValue({}),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

import { getDoc } from 'firebase/firestore';
import Popup from '@pages/popup/Popup';
import { AuthProvider } from '../hooks/useAuth';
import React from 'react';

// ── Helpers ──────────────────────────────────────────────────────

/** Render Popup signed in with default (empty) storage. */
function renderHome() {
  const result = render(
    <AuthProvider>
      <Popup />
    </AuthProvider>,
  );
  act(() => {
    authStateCallback?.({ uid: 'test-uid', email: 'test@example.com' });
  });
  return result;
}

/** Render Popup signed in with custom storage values returned by browser.storage.local.get. */
function renderHomeWithStorage(storageValues: Record<string, unknown>) {
  (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue(storageValues);
  return renderHome();
}

// ── Tests ────────────────────────────────────────────────────────

describe('Popup Homepage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
  });

  // ── Header ──────────────────────────────────────────────────

  it('should render the SlopMop title and logo', async () => {
    renderHome();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    expect(screen.getByAltText('SlopMop logo')).toBeInTheDocument();
  });

  it('should show the settings gear button', async () => {
    renderHome();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
  });

  it('should display "Active" status badge when detection is enabled', async () => {
    renderHome();
    expect(await screen.findByText('Active')).toBeInTheDocument();
  });

  it('should display "Paused" status badge after pausing detection', async () => {
    const user = userEvent.setup();
    renderHome();

    expect(await screen.findByText('Active')).toBeInTheDocument();

    const pauseButton = screen.getByRole('button', { name: /Pause Detection/i });
    await user.click(pauseButton);

    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  // ── Detection Toggle ────────────────────────────────────────

  it('should render the "Pause Detection" button when enabled', async () => {
    renderHome();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pause Detection/i })).toBeInTheDocument();
  });

  it('should switch to "Enable Detection" after clicking pause', async () => {
    const user = userEvent.setup();
    renderHome();

    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    const pauseBtn = screen.getByRole('button', { name: /Pause Detection/i });
    await user.click(pauseBtn);

    expect(screen.getByRole('button', { name: /Enable Detection/i })).toBeInTheDocument();
  });

  it('should persist the toggle state to browser.storage.local', async () => {
    const user = userEvent.setup();
    renderHome();

    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    const pauseBtn = screen.getByRole('button', { name: /Pause Detection/i });
    await user.click(pauseBtn);

    expect(browser.storage.local.set).toHaveBeenCalledWith({ enabled: false });

    const enableBtn = screen.getByRole('button', { name: /Enable Detection/i });
    await user.click(enableBtn);

    expect(browser.storage.local.set).toHaveBeenCalledWith({ enabled: true });
  });

  // ── Stats Grid ──────────────────────────────────────────────

  it('should render all three stat cards with zero values by default', async () => {
    renderHome();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    expect(screen.getByText('Posts Scanned')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('AI Detected')).toBeInTheDocument();

    // Default stats are all zero
    const zeroes = screen.getAllByText('0');
    expect(zeroes.length).toBeGreaterThanOrEqual(3);
  });

  it('should display stat values loaded from Firestore', async () => {
    // Mock Firestore to return a doc with custom stats so loadSettings uses them
    (getDoc as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: () => true,
      data: () => ({
        settings: {
          sensitivity: 'medium',
          highlightStyle: 'badge',
          showNotifications: true,
          platforms: { twitter: true, reddit: true, facebook: true, youtube: true, linkedin: true },
        },
        stats: { postsScanned: 42, aiDetected: 7, postsProcessing: 3 },
      }),
    });
    renderHome();

    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // ── Disclaimer Banner ───────────────────────────────────────

  it('should render the detection disclaimer', async () => {
    renderHome();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    expect(screen.getByText(/Detection Notice/)).toBeInTheDocument();
    expect(
      screen.getByText(/probability-based estimates, not definitive determinations/),
    ).toBeInTheDocument();
  });

  // ── Sign Out Button ─────────────────────────────────────────

  it('should render a Sign Out button on the home view', async () => {
    renderHome();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign Out/i })).toBeInTheDocument();
  });

  // ── Confidence Display ──────────────────────────────────────

  it('should not show confidence section when no detection response exists', async () => {
    renderHome();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    expect(screen.queryByText(/Confidence:/)).not.toBeInTheDocument();
  });

  it('should show confidence when a detection response is in storage', async () => {
    renderHomeWithStorage({
      lastDetectResponse: { confidence: 0.85 },
    });

    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    // ConfidenceDisplay + inline section both render confidence text
    const confidenceEls = screen.getAllByText(/Confidence:\s*85\s*%/);
    expect(confidenceEls.length).toBeGreaterThanOrEqual(1);
  });

  it('should show confidence from alternative field names', async () => {
    renderHomeWithStorage({
      detectResponse: { confidenceScore: 0.62 },
    });

    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    const confidenceEls = screen.getAllByText(/Confidence:\s*62\s*%/);
    expect(confidenceEls.length).toBeGreaterThanOrEqual(1);
  });

  it('should render an explanation alongside the confidence score', async () => {
    renderHomeWithStorage({
      lastDetectResponse: { confidence: 0.85, explanation: 'High AI likelihood detected.' },
    });

    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    const confidenceEls = screen.getAllByText(/Confidence:\s*85\s*%/);
    expect(confidenceEls.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('High AI likelihood detected.')).toBeInTheDocument();
  });

  // ── Navigation to Settings ──────────────────────────────────

  it('should navigate to settings view when the settings button is clicked', async () => {
    const user = userEvent.setup();
    renderHome();

    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Settings'));

    // Settings header appears, home-specific elements disappear
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByText('Pause Detection')).not.toBeInTheDocument();
  });

  // ── Storage listener lifecycle ──────────────────────────────

  it('should register and clean up the storage.onChanged listener', async () => {
    const { unmount } = renderHome();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    expect(browser.storage.onChanged.addListener).toHaveBeenCalled();

    unmount();

    expect(browser.storage.onChanged.removeListener).toHaveBeenCalled();
  });
});