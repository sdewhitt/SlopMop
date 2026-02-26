import browser from 'webextension-polyfill';

console.log('background script loaded');

// Disable the default popup so that action.onClicked fires.
// The popup page is kept in the manifest only so CRXJS bundles it;
// it's actually rendered by the content script directly in the page DOM.
browser.action.setPopup({ popup: '' });

// Initialize default settings on install
browser.runtime.onInstalled.addListener(async () => {
  const result = await browser.storage.local.get('settings');
  if (!result.settings) {
    await browser.storage.local.set({
      enabled: true,
      postsScanned: 0,
      aiDetected: 0,
      settings: {
        enabled: true,
        sensitivity: 'medium',
        highlightStyle: 'badge',
        platforms: {
          twitter: true,
          reddit: true,
          facebook: true,
          youtube: true,
          linkedin: true,
        },
        showNotifications: true,
      },
    });
  }
});

/**
 * Handle messages from content scripts.
 * Currently used to proxy the Google OAuth flow, since browser.identity
 * is not available in content scripts.
 */
browser.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message !== 'object' || message === null) return;
  const msg = message as Record<string, unknown>;

  if (msg.type === 'SLOPMOP_GOOGLE_AUTH') {
    return handleGoogleAuth();
  }
});

async function handleGoogleAuth(): Promise<string> {
  const clientId = import.meta.env.VITE_FIREBASE_OAUTH_CLIENT_ID as string;
  if (!clientId) {
    throw new Error(
      'Google sign-in not configured. Add VITE_FIREBASE_OAUTH_CLIENT_ID to .env',
    );
  }

  const redirectUrl = browser.identity.getRedirectURL();
  const scopes = ['openid', 'email', 'profile'];
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'id_token');
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('nonce', Math.random().toString(36).substring(2));

  const responseUrl = await browser.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });

  const url = new URL(responseUrl);
  const params = new URLSearchParams(url.hash.substring(1));
  const idToken = params.get('id_token');
  if (!idToken) {
    throw new Error('No ID token returned from Google');
  }

  return idToken;
}

/**
 * When the extension icon is clicked, send a toggle message to the content
 * script in the active tab. If the content script isn't available (e.g. on
 * chrome:// or about: pages), fall back to opening the popup in a new tab.
 */
browser.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await browser.tabs.sendMessage(tab.id, { type: 'SLOPMOP_TOGGLE_PANEL' });
  } catch {
    // Content script not available on this page — open as a standalone tab
    const popupUrl = browser.runtime.getURL('src/pages/popup/index.html');
    await browser.tabs.create({ url: popupUrl });
  }
});
