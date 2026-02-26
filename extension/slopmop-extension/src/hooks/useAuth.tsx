/**
 * React hook providing auth state and actions for the extension popup.
 *
 * All Firebase Auth operations run in the background script (which is
 * unrestricted by page CSP). This hook communicates with the background
 * via browser.runtime.sendMessage and reads auth state from
 * browser.storage.local, which the background keeps in sync via
 * onAuthStateChanged.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import browser from 'webextension-polyfill';

/** Serialisable user data stored in browser.storage.local by the background. */
export interface SlopMopUser {
  uid: string;
  email: string | null;
}

interface AuthContextType {
  user: SlopMopUser | null;
  loading: boolean;
  logIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SlopMopUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Read initial auth state that the background synced to storage
    browser.storage.local.get('slopmopUser').then((result) => {
      if (result.slopmopUser) {
        setUser(result.slopmopUser as SlopMopUser);
      }
      setLoading(false);
    });

    // Listen for auth state changes pushed by the background script
    const onStorageChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
    ) => {
      if ('slopmopUser' in changes) {
        const newVal = changes.slopmopUser.newValue as SlopMopUser | undefined;
        setUser(newVal ?? null);
      }
    };

    browser.storage.onChanged.addListener(onStorageChanged);
    return () => browser.storage.onChanged.removeListener(onStorageChanged);
  }, []);

  const logIn = async (email: string, password: string) => {
    const res = (await browser.runtime.sendMessage({
      type: 'SLOPMOP_LOGIN',
      email,
      password,
    })) as { success: boolean; error?: string };

    if (!res.success) throw new Error(res.error ?? 'Login failed');
  };

  const signUp = async (email: string, password: string) => {
    const res = (await browser.runtime.sendMessage({
      type: 'SLOPMOP_SIGNUP',
      email,
      password,
    })) as { success: boolean; error?: string };

    if (!res.success) throw new Error(res.error ?? 'Sign-up failed');
  };

  const signInWithGoogle = async () => {
    const res = (await browser.runtime.sendMessage({
      type: 'SLOPMOP_GOOGLE_AUTH',
    })) as { success: boolean; error?: string };

    if (!res.success) throw new Error(res.error ?? 'Google sign-in failed');
  };

  const logOut = async () => {
    const res = (await browser.runtime.sendMessage({
      type: 'SLOPMOP_LOGOUT',
    })) as { success: boolean; error?: string };

    if (!res.success) throw new Error(res.error ?? 'Logout failed');
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
