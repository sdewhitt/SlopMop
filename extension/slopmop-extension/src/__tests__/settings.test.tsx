import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// TODO: Revise once the placeholder fields have been modified

// ── Mocks ────────────────────────────────────────────────────────

// Mock webextension-polyfill before importing Popup
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
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

// Track the auth callback so tests can simulate signed-in / signed-out state
let authStateCallback: ((user: unknown) => void) | null = null;

vi.mock('firebase/auth', () => {
  const GoogleAuthProvider = vi.fn(() => ({}));
  GoogleAuthProvider.credential = vi.fn(() => ({}));
  return {
    getAuth: vi.fn(() => ({})),
    setPersistence: vi.fn().mockResolvedValue(undefined),
    browserLocalPersistence: {},
    GoogleAuthProvider,
    onAuthStateChanged: vi.fn((_auth: unknown, cb: (user: unknown) => void) => {
      authStateCallback = cb;
      return vi.fn(); // unsubscribe
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

import Popup from '@pages/popup/Popup';
import { AuthProvider } from '../hooks/useAuth';
import React from 'react';

/** Render Popup wrapped with AuthProvider and simulate a signed-in user. */
function renderPopupSignedIn() {
  const result = render(
    <AuthProvider>
      <Popup />
    </AuthProvider>,
  );
  // Simulate Firebase resolving auth with a user
  act(() => {
    if (authStateCallback) {
      authStateCallback({ uid: 'test-uid', email: 'test@example.com' });
    }
  });
  return result;
}

/** Render Popup wrapped with AuthProvider (no user). */
function renderPopupSignedOut() {
  const result = render(
    <AuthProvider>
      <Popup />
    </AuthProvider>,
  );
  // Simulate Firebase resolving auth without a user
  act(() => {
    if (authStateCallback) {
      authStateCallback(null);
    }
  });
  return result;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Popup Auth Gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
  });

  it('should show sign-in view when user is not authenticated', async () => {
    renderPopupSignedOut();
    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
  });

  it('should show the home view when user is authenticated', async () => {
    renderPopupSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to continue')).not.toBeInTheDocument();
  });

  it('should allow toggling between sign-in and sign-up modes', async () => {
    const user = userEvent.setup();
    renderPopupSignedOut();

    // Wait for sign-in view
    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();

    // Switch to sign-up
    const signUpLink = screen.getByText('Sign up');
    await user.click(signUpLink);
    expect(screen.getByText('Create your account')).toBeInTheDocument();

    // Switch back to sign-in
    const signInLink = screen.getByText('Sign in');
    await user.click(signInLink);
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
  });
});

describe('Popup Settings Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
  });

  it('should render settings view when settings button is clicked', async () => {
    const user = userEvent.setup();
    renderPopupSignedIn();

    // Wait for home view
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    // Find and click the settings button
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check that the settings header is rendered
    const settingsHeader = screen.getByText('Settings');
    expect(settingsHeader).toBeInTheDocument();
  });

  it('should render all settings sections', async () => {
    const user = userEvent.setup();
    renderPopupSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for section headers
    expect(screen.getByText(/Detection/i)).toBeInTheDocument();
    expect(screen.getByText(/Platforms/i)).toBeInTheDocument();
    expect(screen.getByText(/Data/i)).toBeInTheDocument();
    expect(screen.getByText(/Account/i)).toBeInTheDocument();
  });

  it('should render notification toggle in settings', async () => {
    const user = userEvent.setup();
    renderPopupSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for Show Notifications toggle
    expect(screen.getByText('Show Notifications')).toBeInTheDocument();
    expect(screen.getByText('Alert when AI content is detected')).toBeInTheDocument();
  });

  it('should render sensitivity options', async () => {
    const user = userEvent.setup();
    renderPopupSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for Sensitivity options
    expect(screen.getByText('Sensitivity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /low/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /medium/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /high/i })).toBeInTheDocument();
  });

  it('should render highlight style options', async () => {
    const user = userEvent.setup();
    renderPopupSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for Highlight Style options
    expect(screen.getByText('Highlight Style')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /badge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /border/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dim/i })).toBeInTheDocument();
  });

  it('should render platform toggles', async () => {
    const user = userEvent.setup();
    renderPopupSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for platform toggles
    expect(screen.getByText('Twitter')).toBeInTheDocument();
    expect(screen.getByText('Reddit')).toBeInTheDocument();
    expect(screen.getByText('Facebook')).toBeInTheDocument();
    expect(screen.getByText('Youtube')).toBeInTheDocument();
    expect(screen.getByText('Linkedin')).toBeInTheDocument();
  });

  it('should render reset buttons in data section', async () => {
    const user = userEvent.setup();
    renderPopupSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for reset buttons
    expect(screen.getByRole('button', { name: /Reset Stats/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset All/i })).toBeInTheDocument();
  });

  it('should render sign-out button and user email in settings', async () => {
    const user = userEvent.setup();
    renderPopupSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for account section
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign Out/i })).toBeInTheDocument();
  });

  it('should navigate back to home view when back button is clicked', async () => {
    const user = userEvent.setup();
    renderPopupSignedIn();
    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check that we're in settings view
    expect(screen.getByText('Settings')).toBeInTheDocument();

    // Click back button
    const backButton = screen.getByLabelText('Back');
    await user.click(backButton);

    // Should be back to home with SlopMop title
    expect(screen.getByText('SlopMop')).toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });
});
