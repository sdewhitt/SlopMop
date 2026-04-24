import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Default mock for webextension-polyfill so any module that imports it
// (e.g. detectionCache, detectionHistory) loads in the vitest jsdom
// environment. Individual test files can still override with vi.mock().
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    tabs: {
      get: vi.fn(async () => ({ incognito: false })),
      query: vi.fn(async () => []),
      sendMessage: vi.fn(async () => undefined),
    },
    runtime: {
      getURL: vi.fn((path: string) => path),
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  },
}));

declare global {
  var chrome: {
    runtime: {
      getURL: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
    };
    storage: {
      local: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
        remove: ReturnType<typeof vi.fn>;
        clear: ReturnType<typeof vi.fn>;
      };
      sync: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
        remove: ReturnType<typeof vi.fn>;
        clear: ReturnType<typeof vi.fn>;
      };
    };
    tabs: {
      query: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock chrome API for extension testing
globalThis.chrome = {
  runtime: {
    getURL: vi.fn((path: string) => path),
    sendMessage: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    create: vi.fn(),
  },
};
