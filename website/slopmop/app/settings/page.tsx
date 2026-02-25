"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "../components/navbar";
import Footer from "../components/footer";
import { useAuth } from "../context/AuthContext";
import { UserSettingsProvider, useUserSettings } from "../context/UserSettingsContext";
import type { PlatformToggles } from "../lib/userSettings";

/* ───────────────────────── tiny reusable toggle ─────────────────────────── */

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-center justify-between py-3 cursor-pointer group">
      <div>
        <p className="text-sm font-medium text-neutral-800 group-hover:text-black dark:text-neutral-200 dark:group-hover:text-white transition-colors">
          {label}
        </p>
        {description && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          checked ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-600"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

/* ───────────────────────── pill selector helper ─────────────────────────── */

function PillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
            value === opt
              ? "bg-blue-600 text-white"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════ Settings Page ═══════════════════════════════ */

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();

  /* ── guard: redirect if not logged in ──────────────────────────────── */
  if (!authLoading && !user) {
    return (
      <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
        <Navbar />
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Sign in required</h1>
          <p className="text-neutral-500 dark:text-neutral-400 max-w-md">
            You need to be signed in to view and manage your settings.
          </p>
          <Link
            href="/login"
            className="mt-2 rounded-full bg-foreground px-6 py-2 text-background transition hover:opacity-80"
          >
            Log In
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  /* ── loading auth ──────────────────────────────────────────────────── */
  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <p className="animate-pulse text-neutral-500">Loading settings…</p>
        </main>
        <Footer />
      </div>
    );
  }

  /* Only mount the provider (and thus trigger Firestore) once we know
     the user is authenticated. This avoids permission errors on pages
     that don't need user settings. */
  return (
    <UserSettingsProvider>
      <SettingsContent />
    </UserSettingsProvider>
  );
}

/* ─────────────────── Inner component consuming context ──────────────────── */

function SettingsContent() {
  const {
    userSettings,
    loading: settingsLoading,
    error,
    updateSettings,
    setIgnoredSites,
    resetStats,
    resetSettings,
  } = useUserSettings();

  const [newSite, setNewSite] = useState("");
  const [saved, setSaved] = useState(false);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  /* ── loading Firestore data ────────────────────────────────────────── */
  if (settingsLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <p className="animate-pulse text-neutral-500">Loading settings…</p>
        </main>
        <Footer />
      </div>
    );
  }

  const { settings, stats, ignoredSites } = userSettings;

  /* ── handlers ──────────────────────────────────────────────────────── */

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    const site = newSite.trim().toLowerCase();
    if (!site || ignoredSites.includes(site)) return;
    await setIgnoredSites([...ignoredSites, site]);
    setNewSite("");
    flashSaved();
  };

  const handleRemoveSite = async (site: string) => {
    await setIgnoredSites(ignoredSites.filter((s) => s !== site));
    flashSaved();
  };

  const handleResetStats = async () => {
    await resetStats();
    flashSaved();
  };

  const handleResetSettings = async () => {
    await resetSettings();
    flashSaved();
  };

  /* ── render ────────────────────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
      <Navbar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full transition-opacity duration-300 ${
              saved
                ? "opacity-100 bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
                : "opacity-0"
            }`}
          >
            Saved
          </span>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="font-medium mb-1">Unable to load saved settings</p>
            <p className="text-amber-700 dark:text-amber-400">
              {error.includes("Missing or insufficient permissions") || error.includes("Firestore")
                ? "The Firestore database may not be set up yet. Please create a Firestore database in the Firebase Console and deploy security rules. Showing defaults in the meantime."
                : error}
            </p>
          </div>
        )}

        {/* ── Stats ──────────────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
            Statistics
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.postsScanned}</p>
              <p className="text-xs text-neutral-500 mt-1">Posts Scanned</p>
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.postsProcessing}</p>
              <p className="text-xs text-neutral-500 mt-1">Processing</p>
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{stats.aiDetected}</p>
              <p className="text-xs text-neutral-500 mt-1">AI Detected</p>
            </div>
          </div>
        </section>

        {/* ── Detection ──────────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
            Detection
          </h2>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
            <Toggle
              checked={settings.showNotifications}
              onChange={async (v) => {
                await updateSettings({ showNotifications: v });
                flashSaved();
              }}
              label="Show Notifications"
              description="Alert when AI content is detected"
            />

            <div>
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                Sensitivity
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                Higher sensitivity flags more content but may increase false positives
              </p>
              <PillGroup
                options={["low", "medium", "high"] as const}
                value={settings.sensitivity}
                onChange={async (v) => {
                  await updateSettings({ sensitivity: v });
                  flashSaved();
                }}
              />
            </div>

            <div>
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                Highlight Style
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                How flagged content is visually marked
              </p>
              <PillGroup
                options={["badge", "border", "dim"] as const}
                value={settings.highlightStyle}
                onChange={async (v) => {
                  await updateSettings({ highlightStyle: v });
                  flashSaved();
                }}
              />
            </div>
          </div>
        </section>

        {/* ── Platforms ──────────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
            Platforms
          </h2>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 divide-y divide-neutral-100 dark:divide-neutral-800">
            {(Object.keys(settings.platforms) as Array<keyof PlatformToggles>).map(
              (platform) => (
                <Toggle
                  key={platform}
                  checked={settings.platforms[platform]}
                  onChange={async (v) => {
                    await updateSettings({
                      platforms: { ...settings.platforms, [platform]: v },
                    });
                    flashSaved();
                  }}
                  label={platform.charAt(0).toUpperCase() + platform.slice(1)}
                />
              )
            )}
          </div>
        </section>

        {/* ── Ignored Sites ──────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
            Ignored Sites
          </h2>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              The extension will skip detection on these sites.
            </p>

            <form onSubmit={handleAddSite} className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. example.com"
                value={newSite}
                onChange={(e) => setNewSite(e.target.value)}
                className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Add
              </button>
            </form>

            {ignoredSites.length === 0 ? (
              <p className="text-sm text-neutral-400 dark:text-neutral-500 italic">
                No ignored sites yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {ignoredSites.map((site) => (
                  <li
                    key={site}
                    className="flex items-center justify-between rounded-lg bg-neutral-50 dark:bg-neutral-900 px-3 py-2 text-sm"
                  >
                    <span className="text-neutral-700 dark:text-neutral-300">{site}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSite(site)}
                      className="text-red-500 hover:text-red-700 dark:hover:text-red-400 text-xs font-medium transition-colors"
                      aria-label={`Remove ${site}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ── Data / Resets ───────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
            Data
          </h2>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleResetStats}
              className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Reset Statistics
            </button>
            <button
              type="button"
              onClick={handleResetSettings}
              className="flex-1 rounded-lg border border-red-200 dark:border-red-800 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              Reset All Settings
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
