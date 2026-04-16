import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import browser from 'webextension-polyfill';
import React from 'react';

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

vi.mock('../lib/firestoreProxy', () => ({
  getOrCreateUserSettings: vi.fn().mockResolvedValue({
    settings: {
      sensitivity: 'medium',
      highlightStyle: 'badge',
      showNotifications: true,
      automaticScanning: false,
      platforms: { twitter: true, reddit: true, facebook: true, youtube: true, linkedin: true },
      enabled: true,
      scanText: true,
      scanImages: false,
      scanComments: 'auto_top_n',
      uiMode: 'simple',
      badgeSize: 'medium',
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

function renderPopupSignedIn() {
  (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
    slopmopUser: { uid: 'test-uid', email: 'test@example.com' },
  });

  return render(
    <ThemeProvider>
      <AuthProvider>
        <Popup />
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe('Extension report submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageChangedCallback = null;
    (browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (browser.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (changes: Record<string, unknown>) => void) => {
        storageChangedCallback = cb;
      },
    );
  });

  it('shows a report entry point in settings', async () => {
    const user = userEvent.setup();
    renderPopupSignedIn();

    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Settings'));
    expect(screen.getByRole('button', { name: /Report an issue/i })).toBeInTheDocument();
  });

  it('validates report message before submit', async () => {
    const user = userEvent.setup();
    renderPopupSignedIn();

    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Settings'));
    await user.click(screen.getByRole('button', { name: /Report an issue/i }));

    expect(screen.getByText('Report an Issue')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Submit report/i }));

    expect(
      screen.getByText('Please describe the issue before submitting.'),
    ).toBeInTheDocument();
  });

  it('submits report payload through background messaging and shows success state', async () => {
    const user = userEvent.setup();

    (browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      async (message: Record<string, unknown>) => {
        if (message.type === 'SLOPMOP_SUBMIT_REPORT') {
          return {
            success: true,
            data: {
              reportId: 'rep_123',
            },
          };
        }
        return { success: true };
      },
    );

    renderPopupSignedIn();

    expect(await screen.findByText('SlopMop')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Settings'));
    await user.click(screen.getByRole('button', { name: /Report an issue/i }));

    await user.selectOptions(screen.getByLabelText('Report type'), 'bug');
    await user.type(screen.getByLabelText('What happened?'), 'The popup froze while scanning a post.');
    await user.clear(screen.getByLabelText('Page URL \(optional\)'));
    await user.type(screen.getByLabelText('Page URL \(optional\)'), 'https://example.com/post/1');
    await user.clear(screen.getByLabelText('Contact email \(optional\)'));
    await user.type(screen.getByLabelText('Contact email \(optional\)'), 'reporter@example.com');

    await user.click(screen.getByRole('button', { name: /Submit report/i }));

    await waitFor(() => {
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SLOPMOP_SUBMIT_REPORT',
          reportPayload: expect.objectContaining({
            type: 'bug',
            message: 'The popup froze while scanning a post.',
            pageUrl: expect.stringContaining('https://example.com/post/1'),
            reporterEmail: expect.stringContaining('reporter@example.com'),
          }),
        }),
      );
    });

    expect(await screen.findByText(/Ticket ID: rep_123/i)).toBeInTheDocument();
  });
});
