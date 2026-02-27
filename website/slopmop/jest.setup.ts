import '@testing-library/jest-dom'
import React from 'react'

// Provide a global fetch mock for modules like @firebase/auth that require it
if (typeof global.fetch === 'undefined') {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    })
  ) as any;
}

// Mock the Firebase library to prevent real Firebase calls in tests
jest.mock('./app/lib/firebase', () => ({
  auth: undefined,
  db: undefined,
  googleProvider: undefined,
  initFirebase: jest.fn(() => Promise.resolve()),
}));

// Mock firebase/auth to avoid Node.js compatibility issues in jsdom
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  onAuthStateChanged: jest.fn(() => jest.fn()),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
}));

// Mock firebase/firestore to avoid Node.js compatibility issues in jsdom
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(() =>
    Promise.resolve({ exists: () => false, data: () => undefined })
  ),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 'mock-server-timestamp'),
}));

// Mock next/navigation for components that use useRouter, usePathname, etc.
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock AuthContext to provide a default logged-out user for component tests
const mockUseAuth = jest.fn(() => ({
  user: null,
  loading: false,
  signUp: jest.fn(),
  logIn: jest.fn(),
  signInWithGoogle: jest.fn(),
  logOut: jest.fn(),
}));

jest.mock('./app/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockUseAuth(),
}));

// Mock Firestore service to prevent real Firestore calls in tests
jest.mock('./app/lib/firestore', () => ({
  getUserSettings: jest.fn(() => Promise.resolve(null)),
  createUserSettings: jest.fn(() => Promise.resolve({
    ignoredSites: [],
    settings: {
      sensitivity: 'medium',
      highlightStyle: 'badge',
      showNotifications: true,
      platforms: { twitter: true, reddit: true, facebook: true, youtube: true, linkedin: true },
    },
    stats: { postsScanned: 0, aiDetected: 0, postsProcessing: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })),
  getOrCreateUserSettings: jest.fn(() => Promise.resolve({
    ignoredSites: [],
    settings: {
      sensitivity: 'medium',
      highlightStyle: 'badge',
      showNotifications: true,
      platforms: { twitter: true, reddit: true, facebook: true, youtube: true, linkedin: true },
    },
    stats: { postsScanned: 0, aiDetected: 0, postsProcessing: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })),
  updateDetectionSettings: jest.fn(() => Promise.resolve()),
  updateDetectionStats: jest.fn(() => Promise.resolve()),
  updateIgnoredSites: jest.fn(() => Promise.resolve()),
  addIgnoredSite: jest.fn(() => Promise.resolve()),
  removeIgnoredSite: jest.fn(() => Promise.resolve()),
  resetStats: jest.fn(() => Promise.resolve()),
  resetSettings: jest.fn(() => Promise.resolve()),
}));

// Mock UserSettingsContext to provide default settings for component tests
jest.mock('./app/context/UserSettingsContext', () => ({
  UserSettingsProvider: ({ children }: { children: React.ReactNode }) => children,
  useUserSettings: () => ({
    userSettings: {
      ignoredSites: [],
      settings: {
        sensitivity: 'medium',
        highlightStyle: 'badge',
        showNotifications: true,
        platforms: { twitter: true, reddit: true, facebook: true, youtube: true, linkedin: true },
      },
      stats: { postsScanned: 0, aiDetected: 0, postsProcessing: 0 },
      createdAt: '',
      updatedAt: '',
    },
    loading: false,
    error: null,
    updateSettings: jest.fn(),
    updateStats: jest.fn(),
    setIgnoredSites: jest.fn(),
    addIgnoredSite: jest.fn(),
    removeIgnoredSite: jest.fn(),
    resetStats: jest.fn(),
    resetSettings: jest.fn(),
    refresh: jest.fn(),
  }),
}));

// Mock IntersectionObserver which is not available in Jest/Node environment
global.IntersectionObserver = class IntersectionObserver {
  private callback: IntersectionObserverCallback
  private elements: Set<Element> = new Set()

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }

  disconnect() {
    this.elements.clear()
  }

  observe(element: Element) {
    this.elements.add(element)
    // Call the callback immediately with isIntersecting=true to simulate the element being visible
    this.callback(
      [
        {
          target: element,
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: element.getBoundingClientRect(),
          intersectionRect: element.getBoundingClientRect(),
          rootBounds: null,
          time: Date.now(),
        } as IntersectionObserverEntry,
      ],
      this as any
    )
  }

  takeRecords() {
    return []
  }

  unobserve(element: Element) {
    this.elements.delete(element)
  }
} as any

