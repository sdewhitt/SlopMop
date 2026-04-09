"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../components/navbar";
import Footer from "../components/footer";
import { useAuth } from "../context/AuthContext";
import {
  REPORT_TYPES,
  type ReportType,
} from "../lib/reportTypes";

const TYPE_LABELS: Record<ReportType, string> = {
  incorrect_detection: "Incorrect detection",
  bug: "Bug",
  other: "Other",
};

export default function ReportPage() {
  const { user } = useAuth();

  const [reportType, setReportType] = useState<ReportType | "">("");
  const [message, setMessage] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!reporterEmail && user?.email) {
      setReporterEmail(user.email);
    }
  }, [reporterEmail, user?.email]);

  const charCount = useMemo(() => message.length, [message]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!reportType) {
      setError("Please select a report type.");
      return;
    }

    if (!message.trim()) {
      setError("Please include a description of the issue.");
      return;
    }

    if (message.trim().length > 2000) {
      setError("Message must be 2000 characters or fewer.");
      return;
    }

    setSubmitting(true);

    try {
      const idToken = user ? await user.getIdToken() : null;

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          type: reportType,
          source: "website",
          message: message.trim(),
          pageUrl: pageUrl.trim() || null,
          reporterEmail: reporterEmail.trim() || null,
          userAgent:
            typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
        }),
      });

      const body = (await res.json()) as {
        error?: string;
        reportId?: string;
        notificationScheduledFor?: string;
      };

      if (!res.ok) {
        throw new Error(body.error ?? "Unable to submit report");
      }

      setReportType("");
      setMessage("");
      setPageUrl("");

      setSuccess(
        `Report submitted (ID: ${body.reportId ?? "unknown"}). Dev notifications are sent on the configured ${body.notificationScheduledFor ?? "default"} schedule.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Report an Issue</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            Help improve SlopMop by reporting incorrect detections and bugs.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
        >
          <div>
            <label
              htmlFor="report-type"
              className="mb-1 block text-sm font-medium text-neutral-800 dark:text-neutral-200"
            >
              Report Type
            </label>
            <select
              id="report-type"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType | "")}
              className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-700"
            >
              <option value="">Select report type</option>
              {REPORT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="report-message"
              className="mb-1 block text-sm font-medium text-neutral-800 dark:text-neutral-200"
            >
              Message
            </label>
            <textarea
              id="report-message"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What went wrong? Include what you expected to happen."
              className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-700"
            />
            <p className="mt-1 text-xs text-neutral-500">{charCount}/2000</p>
          </div>

          <div>
            <label
              htmlFor="report-url"
              className="mb-1 block text-sm font-medium text-neutral-800 dark:text-neutral-200"
            >
              Related Page URL (optional)
            </label>
            <input
              id="report-url"
              type="url"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://example.com/post/..."
              className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-700"
            />
          </div>

          <div>
            <div>
              <label
                htmlFor="report-email"
                className="mb-1 block text-sm font-medium text-neutral-800 dark:text-neutral-200"
              >
                Email for follow-up (optional)
              </label>
              <input
                id="report-email"
                type="email"
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 dark:border-neutral-700"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
              {success}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-foreground px-6 py-2 text-sm font-semibold text-background transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Report"}
            </button>
            {!user && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Signed-in users can submit with account context for faster triage.
              </p>
            )}
          </div>
        </form>

        <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
          Developer access to report tickets is available in the admin portal.
          <span className="ml-1">
            <Link href="/admin/reports" className="underline hover:no-underline">
              Open admin reports
            </Link>
          </span>
        </p>
      </main>

      <Footer />
    </div>
  );
}
