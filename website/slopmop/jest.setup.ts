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

// Mock AuthContext to provide a default logged-out user for component tests
jest.mock('./app/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: null,
    loading: false,
    signUp: jest.fn(),
    logIn: jest.fn(),
    signInWithGoogle: jest.fn(),
    logOut: jest.fn(),
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

