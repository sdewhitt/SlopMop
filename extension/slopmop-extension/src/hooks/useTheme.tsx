/**
 * Dark/Light mode support (story 30)
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import browser from 'webextension-polyfill';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY_PREFERENCE = 'themePreference';
/** Legacy key — migrated on read */
const STORAGE_KEY_LEGACY = 'theme';

function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  if (typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyThemeToDocument(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (mode === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
}

function resolvePreference(pref: ThemePreference, system: ThemeMode): ThemeMode {
  if (pref === 'system') return system;
  return pref;
}

interface ThemeContextValue {
  /** User choice: system follows OS; light/dark are fixed */
  themePreference: ThemePreference;
  /** Actual light/dark applied to the document */
  resolvedTheme: ThemeMode;
  /** Flip between light and dark (after first use, preference is no longer "system") */
  toggleTheme: () => void;
  /** Restore following device / browser theme */
  setSystemTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [systemTheme, setSystemThemeState] = useState<ThemeMode>(getSystemTheme);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');

  const resolvedTheme = useMemo(
    () => resolvePreference(themePreference, systemTheme),
    [themePreference, systemTheme],
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemThemeState(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    browser.storage.local
      .get([STORAGE_KEY_PREFERENCE, STORAGE_KEY_LEGACY])
      .then((result) => {
        const prefRaw = result[STORAGE_KEY_PREFERENCE] as string | undefined;
        const legacy = result[STORAGE_KEY_LEGACY] as string | undefined;

        let next: ThemePreference = 'system';
        if (prefRaw === 'system' || prefRaw === 'light' || prefRaw === 'dark') {
          next = prefRaw;
        } else if (legacy === 'light' || legacy === 'dark') {
          next = legacy;
        }

        setThemePreferenceState(next);
        applyThemeToDocument(resolvePreference(next, getSystemTheme()));
      });
  }, []);

  const persistPreference = useCallback((pref: ThemePreference) => {
    setThemePreferenceState(pref);
    const resolved = resolvePreference(pref, systemTheme);
    applyThemeToDocument(resolved);
    if (pref === 'system') {
      void browser.storage.local.set({
        [STORAGE_KEY_PREFERENCE]: 'system',
        [STORAGE_KEY_LEGACY]: resolved,
      });
    } else {
      void browser.storage.local.set({
        [STORAGE_KEY_PREFERENCE]: pref,
        [STORAGE_KEY_LEGACY]: pref,
      });
    }
  }, [systemTheme]);

  const toggleTheme = useCallback(() => {
    const nextMode: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';
    persistPreference(nextMode);
  }, [resolvedTheme, persistPreference]);

  const setSystemTheme = useCallback(() => {
    persistPreference('system');
  }, [persistPreference]);

  const value: ThemeContextValue = {
    themePreference,
    resolvedTheme,
    toggleTheme,
    setSystemTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
