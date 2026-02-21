import browser from 'webextension-polyfill';

console.log('background script loaded');

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
