import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { initAdminDb } from "../../../lib/firebaseAdmin";
import { sendDigestEmail } from "../../../lib/reportEmail";
import {
  type ReportNotificationInterval,
  type ReportRecord,
} from "../../../lib/reportTypes";

function asIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return date.toISOString();
  }
  return null;
}

function toReportRecord(
  id: string,
  data: Record<string, unknown>
): ReportRecord {
  return {
    id,
    type: data.type === "incorrect_detection" || data.type === "bug" ? data.type : "other",
    source: data.source === "extension" ? "extension" : "website",
    status: data.status === "addressed" ? "addressed" : "open",
    message: typeof data.message === "string" ? data.message : "",
    pageUrl: typeof data.pageUrl === "string" ? data.pageUrl : null,
    reporterEmail: typeof data.reporterEmail === "string" ? data.reporterEmail : null,
    submitterUid: typeof data.submitterUid === "string" ? data.submitterUid : null,
    submitterEmail: typeof data.submitterEmail === "string" ? data.submitterEmail : null,
    notificationInterval:
      data.notificationInterval === "daily" || data.notificationInterval === "weekly"
        ? data.notificationInterval
        : "immediate",
    userAgent: typeof data.userAgent === "string" ? data.userAgent : null,
    resolutionNote: typeof data.resolutionNote === "string" ? data.resolutionNote : null,
    addressedAt: asIso(data.addressedAt),
    addressedByUid: typeof data.addressedByUid === "string" ? data.addressedByUid : null,
    addressedByEmail:
      typeof data.addressedByEmail === "string" ? data.addressedByEmail : null,
    lastNotifiedAt: asIso(data.lastNotifiedAt),
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

function hoursForInterval(interval: ReportNotificationInterval): number {
  return interval === "weekly" ? 24 * 7 : 24;
}

function shouldNotify(
  report: ReportRecord,
  interval: ReportNotificationInterval,
  nowMs: number
): boolean {
  if (report.status !== "open") return false;
  if (report.notificationInterval !== interval) return false;

  if (!report.lastNotifiedAt) return true;

  const last = new Date(report.lastNotifiedAt).getTime();
  const cutoff = hoursForInterval(interval) * 60 * 60 * 1000;
  return nowMs - last >= cutoff;
}

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-dispatch-secret");
    const expected = process.env.REPORT_DISPATCH_SECRET;

    if (!expected) {
      return NextResponse.json(
        { error: "REPORT_DISPATCH_SECRET is not configured" },
        { status: 500 }
      );
    }

    if (!secret || secret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = Date.now();
    const db = initAdminDb();

    const [dailySnap, weeklySnap] = await Promise.all([
      db
        .collection("reports")
        .where("status", "==", "open")
        .where("notificationInterval", "==", "daily")
        .get(),
      db
        .collection("reports")
        .where("status", "==", "open")
        .where("notificationInterval", "==", "weekly")
        .get(),
    ]);

    const dailyReports = dailySnap.docs
      .map((doc) => toReportRecord(doc.id, doc.data() as Record<string, unknown>))
      .filter((report) => shouldNotify(report, "daily", now));

    const weeklyReports = weeklySnap.docs
      .map((doc) => toReportRecord(doc.id, doc.data() as Record<string, unknown>))
      .filter((report) => shouldNotify(report, "weekly", now));

    const [dailySent, weeklySent] = await Promise.all([
      sendDigestEmail("daily", dailyReports),
      sendDigestEmail("weekly", weeklyReports),
    ]);

    const updates: Array<Promise<unknown>> = [];

    if (dailySent && dailyReports.length > 0) {
      for (const report of dailyReports) {
        updates.push(
          db.collection("reports").doc(report.id).update({
            lastNotifiedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        );
      }
    }

    if (weeklySent && weeklyReports.length > 0) {
      for (const report of weeklyReports) {
        updates.push(
          db.collection("reports").doc(report.id).update({
            lastNotifiedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        );
      }
    }

    await Promise.all(updates);

    return NextResponse.json(
      {
        ok: true,
        daily: {
          candidates: dailyReports.length,
          sent: dailySent,
        },
        weekly: {
          candidates: weeklyReports.length,
          sent: weeklySent,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dispatch failed";
    console.error("[reports][dispatch]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
