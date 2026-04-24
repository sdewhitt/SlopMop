"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../../components/navbar";
import Footer from "../../components/footer";
import { useAuth } from "../../context/AuthContext";
import { type ReportRecord, type ReportStatus } from "../../lib/reportTypes";

type FilterStatus = ReportStatus | "all";

const FILTER_OPTIONS: FilterStatus[] = ["open", "addressed", "all"];

export default function AdminReportsPage() {
  const { user, loading: authLoading } = useAuth();

  const [statusFilter, setStatusFilter] = useState<FilterStatus>("open");
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      setReports([]);
      return;
    }

    void loadReports(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, statusFilter]);

  async function loadReports(filter: FilterStatus, options?: { background?: boolean }) {
    if (!user) return;

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

      if (!res.ok) {
        throw new Error(body.error ?? "Failed to load reports");
      }

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
    if (!user) return;

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
    if (!user) return;

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

  const totals = useMemo(() => {
    const open = reports.filter((report) => report.status === "open").length;
    const addressed = reports.filter((report) => report.status === "addressed").length;

    return {
      total: reports.length,
      open,
      addressed,
    };
  }, [reports]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-6">
          <p className="animate-pulse text-neutral-500">Checking admin access...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
        <Navbar />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Sign in required</h1>
          <p className="mt-2 text-neutral-500 dark:text-neutral-400">
            You must be signed in with an authorized developer account.
          </p>
          <Link
            href="/login"
            className="mt-4 rounded-full bg-foreground px-6 py-2 text-background"
          >
            Log In
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Reports Portal</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Review incoming reports and mark tickets as addressed.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || refreshing}
              onClick={() => void loadReports(statusFilter, { background: true })}
              className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
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
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "border border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
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

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-neutral-200 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            Loading report tickets...
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 p-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            No reports found for this filter.
          </div>
        ) : (
          <ul className="space-y-4">
            {reports.map((report) => (
              <li
                key={report.id}
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      {report.id}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        report.status === "addressed"
                          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}
                    >
                      {report.status}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {report.type}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {report.source}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-500">
                    {report.createdAt
                      ? new Date(report.createdAt).toLocaleString()
                      : "pending timestamp"}
                  </p>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
                  {report.message}
                </p>

                <div className="mt-3 grid gap-2 text-xs text-neutral-500 md:grid-cols-2">
                  <p>
                    <strong className="font-semibold text-neutral-700 dark:text-neutral-300">
                      Reporter Email:
                    </strong>{" "}
                    {report.reporterEmail ?? "(none)"}
                  </p>
                  <p>
                    <strong className="font-semibold text-neutral-700 dark:text-neutral-300">
                      Interval:
                    </strong>{" "}
                    {report.notificationInterval}
                  </p>
                  <p>
                    <strong className="font-semibold text-neutral-700 dark:text-neutral-300">
                      Page URL:
                    </strong>{" "}
                    {report.pageUrl ?? "(none)"}
                  </p>
                  <p>
                    <strong className="font-semibold text-neutral-700 dark:text-neutral-300">
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
                      className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                    >
                      Mark Addressed
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === report.id}
                      onClick={() => updateReportStatus(report.id, "open")}
                      className="rounded-full border border-neutral-300 px-4 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
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
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
