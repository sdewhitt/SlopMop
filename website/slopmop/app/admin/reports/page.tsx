"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../../components/navbar";
import Footer from "../../components/footer";
import { useAuth } from "../../context/AuthContext";
import {
  REPORT_NOTIFICATION_INTERVALS,
  type ReportNotificationInterval,
  type ReportRecord,
  type ReportStatus,
} from "../../lib/reportTypes";

type FilterStatus = ReportStatus | "all";

const FILTER_OPTIONS: FilterStatus[] = ["open", "addressed", "all"];

export default function AdminReportsPage() {
  const { user, loading: authLoading, logOut } = useAuth();

  const [adminAccess, setAdminAccess] = useState<
    "unknown" | "authorized" | "unauthorized"
  >("unknown");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("open");
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationInterval, setNotificationInterval] =
    useState<ReportNotificationInterval>("immediate");
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const handleAuthorizationFailure = (status: number, message?: string) => {
    if (status !== 401 && status !== 403) {
      return false;
    }

    setAdminAccess("unauthorized");
    setReports([]);
    setError(message ?? "You are not authorized to access admin reports.");
    return true;
  };

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      setReports([]);
      setAdminAccess("unknown");
      return;
    }

    void loadReports(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, statusFilter]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoadingSettings(false);
      setAdminAccess("unknown");
      return;
    }

    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  async function loadReports(filter: FilterStatus, options?: { background?: boolean }) {
    if (!user || adminAccess === "unauthorized") return;

    const isBackgroundRefresh = options?.background === true;

    if (isBackgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/reports?status=${filter}&limit=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = (await res.json()) as {
        error?: string;
        reports?: ReportRecord[];
      };

      if (handleAuthorizationFailure(res.status, body.error)) {
        return;
      }

      if (!res.ok) {
        throw new Error(body.error ?? "Failed to load reports");
      }

      setAdminAccess("authorized");
      setReports(body.reports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
      setReports([]);
    } finally {
      if (isBackgroundRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  async function updateReportStatus(reportId: string, nextStatus: ReportStatus) {
    if (!user || adminAccess === "unauthorized") return;

    setBusyId(reportId);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const body = (await res.json()) as {
        error?: string;
        report?: ReportRecord;
      };

      if (handleAuthorizationFailure(res.status, body.error)) {
        return;
      }

      if (!res.ok) {
        throw new Error(body.error ?? "Failed to update report");
      }

      if (body.report) {
        setReports((prev) =>
          prev.map((report) =>
            report.id === reportId ? body.report ?? report : report
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update report");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteReport(reportId: string) {
    if (!user || adminAccess === "unauthorized") return;

    setBusyId(reportId);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = (await res.json()) as { error?: string };

      if (handleAuthorizationFailure(res.status, body.error)) {
        return;
      }

      if (!res.ok) {
        throw new Error(body.error ?? "Failed to delete report");
      }

      setReports((prev) => prev.filter((report) => report.id !== reportId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete report");
    } finally {
      setBusyId(null);
    }
  }

  async function loadSettings() {
    if (!user || adminAccess === "unauthorized") return;

    setLoadingSettings(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/reports/config", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = (await res.json()) as {
        error?: string;
        settings?: {
          notificationInterval?: ReportNotificationInterval;
        };
      };

      if (handleAuthorizationFailure(res.status, body.error)) {
        return;
      }

      if (!res.ok) {
        throw new Error(body.error ?? "Failed to load report settings");
      }

      setAdminAccess("authorized");
      if (body.settings?.notificationInterval) {
        setNotificationInterval(body.settings.notificationInterval);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report settings");
    } finally {
      setLoadingSettings(false);
    }
  }

  async function saveSettings() {
    if (!user || adminAccess === "unauthorized") return;

    setSavingSettings(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/reports/config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notificationInterval }),
      });

      const body = (await res.json()) as {
        error?: string;
        settings?: {
          notificationInterval?: ReportNotificationInterval;
        };
      };

      if (handleAuthorizationFailure(res.status, body.error)) {
        return;
      }

      if (!res.ok) {
        throw new Error(body.error ?? "Failed to save report settings");
      }

      setAdminAccess("authorized");
      if (body.settings?.notificationInterval) {
        setNotificationInterval(body.settings.notificationInterval);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save report settings");
    } finally {
      setSavingSettings(false);
    }
  }

  const totals = useMemo(() => {
    const open = reports.filter((report) => report.status === "open").length;
    const addressed = reports.filter((report) => report.status === "addressed").length;

    return {
      total: reports.length,
      open,
      addressed,
    };
  }, [reports]);

  if (authLoading || (user && adminAccess === "unknown")) {
    return (
      <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-6">
          <p className="animate-pulse text-slate-500">Checking admin access...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
        <Navbar />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Sign in required</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            You must be signed in with an authorized developer account.
          </p>
          <Link
            href="/login"
            className="mt-4 rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            Log In
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  if (adminAccess === "unauthorized") {
    return (
      <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
        <Navbar />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Admin access required</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            You&apos;re signed in, but this account is not authorized to view report tickets.
          </p>
          {error ? (
            <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="rounded-full border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Back to home
            </Link>
            <button
              type="button"
              onClick={() => void logOut()}
              className="rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              Admin Reports Portal
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Review incoming reports and mark tickets as addressed.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || refreshing}
              onClick={() => void loadReports(statusFilter, { background: true })}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatusFilter(option)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === option
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                }`}
              >
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <StatCard title="Visible tickets" value={String(totals.total)} />
          <StatCard title="Open" value={String(totals.open)} />
          <StatCard title="Addressed" value={String(totals.addressed)} />
        </div>

        <div className="mb-6 rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Notification cadence
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                This is a global server setting for all report notifications.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="report-interval" className="text-xs text-slate-500">
                Interval
              </label>
              <select
                id="report-interval"
                disabled={loadingSettings || savingSettings}
                value={notificationInterval}
                onChange={(e) =>
                  setNotificationInterval(e.target.value as ReportNotificationInterval)
                }
                className="rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-1.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/70 dark:bg-slate-950/70 dark:text-slate-100"
              >
                {REPORT_NOTIFICATION_INTERVALS.map((interval) => (
                  <option key={interval} value={interval}>
                    {interval[0].toUpperCase() + interval.slice(1)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={loadingSettings || savingSettings}
                className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {savingSettings ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200/70 bg-red-50/70 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl border border-white/70 bg-white/70 p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70 dark:text-slate-400">
            Loading report tickets...
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-3xl border border-white/70 bg-white/70 p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70 dark:text-slate-400">
            No reports found for this filter.
          </div>
        ) : (
          <ul className="space-y-4">
            {reports.map((report) => (
              <li
                key={report.id}
                className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {report.id}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        report.status === "addressed"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}
                    >
                      {report.status}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {report.type}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {report.source}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500">
                    {report.createdAt
                      ? new Date(report.createdAt).toLocaleString()
                      : "pending timestamp"}
                  </p>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">
                  {report.message}
                </p>

                <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <p>
                    <strong className="font-semibold text-slate-700 dark:text-slate-300">
                      Reporter Email:
                    </strong>{" "}
                    {report.reporterEmail ?? "(none)"}
                  </p>
                  <p>
                    <strong className="font-semibold text-slate-700 dark:text-slate-300">
                      Last Notified:
                    </strong>{" "}
                    {report.lastNotifiedAt
                      ? new Date(report.lastNotifiedAt).toLocaleString()
                      : "never"}
                  </p>
                  <p>
                    <strong className="font-semibold text-slate-700 dark:text-slate-300">
                      Page URL:
                    </strong>{" "}
                    {report.pageUrl ?? "(none)"}
                  </p>
                  <p>
                    <strong className="font-semibold text-slate-700 dark:text-slate-300">
                      Submitter:
                    </strong>{" "}
                    {report.submitterEmail ?? "anonymous"}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {report.status === "open" ? (
                    <button
                      type="button"
                      disabled={busyId === report.id}
                      onClick={() => updateReportStatus(report.id, "addressed")}
                      className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Mark Addressed
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === report.id}
                      onClick={() => updateReportStatus(report.id, "open")}
                      className="rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      Reopen
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busyId === report.id}
                    onClick={() => deleteReport(report.id)}
                    className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
