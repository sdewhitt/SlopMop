/**
 * Dark/Light mode support (story 30)
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import browser from 'webextension-polyfill';

/** Theme preference: light or dark only. */
export type ThemeMode = 'light' | 'dark';

/** Resolved theme used for actual styling (same as ThemeMode for light/dark toggle). */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/** Get user's system display preference (light/dark). */
function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Convert theme mode to resolved theme (identity for light/dark). */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode;
}

/** Apply resolved theme to document (add/remove .dark class for Tailwind). */
export function applyThemeToDocument(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (resolved === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
}

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeMode>(getSystemTheme);
  const resolvedTheme = resolveTheme(theme);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    applyThemeToDocument(mode);
    browser.storage.local.set({ [STORAGE_KEY]: mode });
  }, []);

  // Load theme from storage on mount; default to system preference when no stored value
  useEffect(() => {
    browser.storage.local.get(STORAGE_KEY).then((result) => {
      const stored = result[STORAGE_KEY] as string | undefined;
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
        applyThemeToDocument(stored);
      } else {
        const systemTheme = getSystemTheme();
        setThemeState(systemTheme);
        applyThemeToDocument(systemTheme);
      }
    });
  }, []);

  useEffect(() => {
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  const value: ThemeContextValue = { theme, resolvedTheme, setTheme };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
