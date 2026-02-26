/**
 * React hook providing Firebase Auth state and actions for the extension popup.
 *
 * Exposes a `useAuth()` hook that tracks the current Firebase user and provides
 * email/password sign-in, sign-up, Google sign-in, and sign-out methods.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import browser from 'webextension-polyfill';
import { auth, initFirebase } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initFirebase();
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logIn = async (email: string, password: string) => {
    initFirebase();
    if (!auth) throw new Error('Firebase not initialized');
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string) => {
    initFirebase();
    if (!auth) throw new Error('Firebase not initialized');
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async () => {
    initFirebase();
    if (!auth) throw new Error('Firebase not initialized');

    // Proxy the OAuth flow through the background script so it works
    // from both extension pages and content scripts (browser.identity
    // is only available in extension contexts, not content scripts).
    const idToken = (await browser.runtime.sendMessage({
      type: 'SLOPMOP_GOOGLE_AUTH',
    })) as string;

    if (!idToken) {
      throw new Error('No ID token returned from Google');
    }

    // Sign in to Firebase with the Google credential
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
  };

  const logOut = async () => {
    initFirebase();
    if (!auth) throw new Error('Firebase not initialized');
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logIn, signUp, signInWithGoogle, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
