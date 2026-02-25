"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import {
  type UserSettings,
  type DetectionSettings,
  type DetectionStats,
  defaultUserSettings,
} from "../lib/userSettings";
import {
  getOrCreateUserSettings,
  getUserSettings,
  updateDetectionSettings as firestoreUpdateDetectionSettings,
  updateDetectionStats as firestoreUpdateDetectionStats,
  updateIgnoredSites as firestoreUpdateIgnoredSites,
  addIgnoredSite as firestoreAddIgnoredSite,
  removeIgnoredSite as firestoreRemoveIgnoredSite,
  resetStats as firestoreResetStats,
  resetSettings as firestoreResetSettings,
} from "../lib/firestore";

interface UserSettingsContextType {
  /** Current settings (defaults when logged out or loading). */
  userSettings: UserSettings;
  /** True while the initial Firestore fetch is in flight. */
  loading: boolean;
  /** Non-null if the most recent Firestore operation failed. */
  error: string | null;
  /** Partially update detection settings and persist to Firestore. */
  updateSettings: (patch: Partial<DetectionSettings>) => Promise<void>;
  /** Overwrite stats and persist to Firestore. */
  updateStats: (stats: DetectionStats) => Promise<void>;
  /** Replace the entire ignored-sites list. */
  setIgnoredSites: (sites: string[]) => Promise<void>;
  /** Add a single site to the ignored list. */
  addIgnoredSite: (site: string) => Promise<void>;
  /** Remove a single site from the ignored list. */
  removeIgnoredSite: (site: string) => Promise<void>;
  /** Reset stats to zero. */
  resetStats: () => Promise<void>;
  /** Reset detection settings to defaults. */
  resetSettings: () => Promise<void>;
  /** Force re-fetch settings from Firestore. */
  refresh: () => Promise<void>;
}

const UserSettingsContext = createContext<UserSettingsContextType | null>(null);

const blankSettings: UserSettings = {
  ...defaultUserSettings,
  createdAt: "",
  updatedAt: "",
};

export function UserSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [userSettings, setUserSettings] = useState<UserSettings>(blankSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch (or create) settings whenever the authenticated user changes.
  // First attempts a read-only fetch; if the document doesn't exist yet,
  // falls back to creating it with defaults.
  const fetchSettings = useCallback(async () => {
    if (!user) {
      setUserSettings(blankSettings);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Try read-only first to avoid permission errors when Firestore
      // rules aren't deployed or the document simply doesn't exist yet.
      const existing = await getUserSettings(user.uid);
      if (existing) {
        setUserSettings(existing);
      } else {
        // Document doesn't exist — create with defaults.
        const created = await getOrCreateUserSettings(user.uid);
        setUserSettings(created);
      }
    } catch (err) {
      // Surface the error but don't break the page — the user can still
      // see defaults and retry.
      console.error("[UserSettings] Failed to load settings:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // ── Mutation helpers ───────────────────────────────────────────

  const updateSettings = useCallback(
    async (patch: Partial<DetectionSettings>) => {
      if (!user) return;
      try {
        await firestoreUpdateDetectionSettings(user.uid, patch);
        setUserSettings((prev) => ({
          ...prev,
          settings: { ...prev.settings, ...patch },
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [user]
  );

  const updateStats = useCallback(
    async (stats: DetectionStats) => {
      if (!user) return;
      try {
        await firestoreUpdateDetectionStats(user.uid, stats);
        setUserSettings((prev) => ({
          ...prev,
          stats,
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [user]
  );

  const setIgnoredSites = useCallback(
    async (sites: string[]) => {
      if (!user) return;
      try {
        await firestoreUpdateIgnoredSites(user.uid, sites);
        setUserSettings((prev) => ({
          ...prev,
          ignoredSites: sites,
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [user]
  );

  const addIgnored = useCallback(
    async (site: string) => {
      if (!user) return;
      try {
        await firestoreAddIgnoredSite(user.uid, site);
        setUserSettings((prev) => ({
          ...prev,
          ignoredSites: prev.ignoredSites.includes(site)
            ? prev.ignoredSites
            : [...prev.ignoredSites, site],
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [user]
  );

  const removeIgnored = useCallback(
    async (site: string) => {
      if (!user) return;
      try {
        await firestoreRemoveIgnoredSite(user.uid, site);
        setUserSettings((prev) => ({
          ...prev,
          ignoredSites: prev.ignoredSites.filter((s) => s !== site),
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [user]
  );

  const doResetStats = useCallback(async () => {
    if (!user) return;
    try {
      await firestoreResetStats(user.uid);
      setUserSettings((prev) => ({
        ...prev,
        stats: { postsScanned: 0, aiDetected: 0, postsProcessing: 0 },
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [user]);

  const doResetSettings = useCallback(async () => {
    if (!user) return;
    try {
      await firestoreResetSettings(user.uid);
      setUserSettings((prev) => ({
        ...prev,
        settings: { ...defaultUserSettings.settings },
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [user]);

  return (
    <UserSettingsContext.Provider
      value={{
        userSettings,
        loading,
        error,
        updateSettings,
        updateStats,
        setIgnoredSites,
        addIgnoredSite: addIgnored,
        removeIgnoredSite: removeIgnored,
        resetStats: doResetStats,
        resetSettings: doResetSettings,
        refresh: fetchSettings,
      }}
    >
      {children}
    </UserSettingsContext.Provider>
  );
}

export function useUserSettings() {
  const ctx = useContext(UserSettingsContext);
  if (!ctx)
    throw new Error(
      "useUserSettings must be used inside UserSettingsProvider"
    );
  return ctx;
}
