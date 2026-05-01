"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "../components/navbar";
import Footer from "../components/footer";
import { useAuth } from "../context/AuthContext";
import { UserSettingsProvider, useUserSettings } from "../context/UserSettingsContext";
import type { PlatformToggles } from "../lib/userSettings";
import { clearOnboardingStorage } from "../lib/onboardingStorage";

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
        <p className="text-sm font-medium text-slate-800 transition-colors group-hover:text-slate-950 dark:text-slate-200 dark:group-hover:text-white">
          {label}
        </p>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
          checked ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-700"
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
          className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium capitalize transition-colors ${
            value === opt
              ? "border-transparent bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "border-slate-200/70 bg-white/80 text-slate-600 hover:bg-slate-50 dark:border-slate-800/70 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:bg-slate-900"
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
      <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="w-full max-w-lg rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Sign in required</h1>
            <p className="mt-2 text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            You need to be signed in to view and manage your settings.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              Log In
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  /* ── loading auth ──────────────────────────────────────────────────── */
  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="rounded-3xl border border-white/70 bg-white/80 px-6 py-5 text-center shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
            <p className="animate-pulse text-slate-500">Loading settings…</p>
          </div>
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
      <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="rounded-3xl border border-white/70 bg-white/80 px-6 py-5 text-center shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
            <p className="animate-pulse text-slate-500">Loading settings…</p>
          </div>
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
    clearOnboardingStorage();
    flashSaved();
  };

  /* ── render ────────────────────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
      <Navbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Settings
          </h1>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full transition-opacity duration-300 ${
              saved
                ? "opacity-100 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                : "opacity-0"
            }`}
          >
            Saved
          </span>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Statistics
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 text-center shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
              <p className="text-2xl font-bold text-emerald-500">{stats.postsScanned}</p>
              <p className="text-xs text-slate-500 mt-1">Posts Scanned</p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 text-center shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
              <p className="text-2xl font-bold text-sky-500">{stats.postsProcessing}</p>
              <p className="text-xs text-slate-500 mt-1">Processing</p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 text-center shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
              <p className="text-2xl font-bold text-amber-500">{stats.aiDetected}</p>
              <p className="text-xs text-slate-500 mt-1">AI Detected</p>
            </div>
          </div>
        </section>

        {/* ── Detection ──────────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Detection
          </h2>
          <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm space-y-4 dark:border-slate-800/70 dark:bg-slate-950/70">
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
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                Sensitivity
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
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
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                Highlight Style
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Platforms
          </h2>
          <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm divide-y divide-slate-100 dark:border-slate-800/70 dark:bg-slate-950/70 dark:divide-slate-800">
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Ignored Sites
          </h2>
          <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm space-y-3 dark:border-slate-800/70 dark:bg-slate-950/70">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The extension will skip detection on these sites.
            </p>

            <form onSubmit={handleAddSite} className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. example.com"
                value={newSite}
                onChange={(e) => setNewSite(e.target.value)}
                className="flex-1 rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 dark:border-slate-700/70 dark:bg-slate-950/70 dark:text-slate-100"
              />
              <button
                type="submit"
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                Add
              </button>
            </form>

            {ignoredSites.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                No ignored sites yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {ignoredSites.map((site) => (
                  <li
                    key={site}
                    className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900"
                  >
                    <span className="text-slate-700 dark:text-slate-200">{site}</span>
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Data
          </h2>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleResetStats}
              className="flex-1 rounded-full border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Reset Statistics
            </button>
            <button
              type="button"
              onClick={handleResetSettings}
              className="flex-1 rounded-full border border-red-200 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
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
