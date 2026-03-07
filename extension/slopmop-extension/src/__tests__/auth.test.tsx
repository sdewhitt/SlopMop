import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import browser from 'webextension-polyfill';

// ── Mocks ────────────────────────────────────────────────────────

let storageChangedCallback: ((changes: Record<string, unknown>) => void) | null = null;

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn((cb: (changes: Record<string, unknown>) => void) => {
          storageChangedCallback = cb;
        }),
        removeListener: vi.fn(),
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

import Popup from '@pages/popup/Popup';
import { AuthProvider } from '../hooks/useAuth';

// ── Helpers ──────────────────────────────────────────────────────

/** Render Popup signed in with default (empty) storage. */
function renderSignedIn() {
  (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
    slopmopUser: { uid: 'test-uid', email: 'test@example.com' },
  });

  const result = render(
    <AuthProvider>
      <Popup />
    </AuthProvider>,
  );
  return result;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageChangedCallback = null;
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      slopmopUser: { uid: 'test-uid', email: 'test@example.com' },
    });
    (browser.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (changes: Record<string, unknown>) => void) => {
        storageChangedCallback = cb;
      },
    );
  });

  // ── Sign Out ────────────────────────────────────────────────

  it('should render a Sign Out button when user is authenticated', async () => {
    renderSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign Out/i })).toBeInTheDocument();
  });

  it('should store user authentication state in storage', async () => {
    const { unmount } = renderSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    // Verify that the component reads from storage
    expect(browser.storage.local.get).toHaveBeenCalled();

    unmount();
  });

  it('should register and clean up the storage.onChanged listener for auth updates', async () => {
    const { unmount } = renderSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    expect(browser.storage.onChanged.addListener).toHaveBeenCalled();

    unmount();

    expect(browser.storage.onChanged.removeListener).toHaveBeenCalled();
  });
});
