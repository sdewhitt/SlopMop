import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { initAdminDb } from "../../lib/firebaseAdmin";
import {
  authenticateOptionalUser,
  ReportAuthError,
  requireAdminUser,
} from "../../lib/reportAuth";
import { sendReportSubmittedEmail } from "../../lib/reportEmail";
import {
  isReportNotificationInterval,
  isReportStatus,
  isReportType,
  normalizeOptionalString,
  type ReportRecord,
  type ReportStatus,
} from "../../lib/reportTypes";
import { getConfiguredReportNotificationInterval } from "../../lib/reportConfig";

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

function isMissingIndexError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const code = (error as { code?: unknown }).code;

  return (
    code === 9 ||
    message.includes("failed_precondition") ||
    message.includes("requires an index")
  );
}

function toReportRecord(
  id: string,
  data: Record<string, unknown>
): ReportRecord {
  return {
    id,
    type: isReportType(data.type) ? data.type : "other",
    source: data.source === "extension" ? "extension" : "website",
    status: isReportStatus(data.status) ? data.status : "open",
    message: typeof data.message === "string" ? data.message : "",
    pageUrl: typeof data.pageUrl === "string" ? data.pageUrl : null,
    reporterEmail:
      typeof data.reporterEmail === "string" ? data.reporterEmail : null,
    submitterUid:
      typeof data.submitterUid === "string" ? data.submitterUid : null,
    submitterEmail:
      typeof data.submitterEmail === "string" ? data.submitterEmail : null,
    notificationInterval: isReportNotificationInterval(data.notificationInterval)
      ? data.notificationInterval
      : "immediate",
    userAgent: typeof data.userAgent === "string" ? data.userAgent : null,
    resolutionNote:
      typeof data.resolutionNote === "string" ? data.resolutionNote : null,
    addressedAt: asIso(data.addressedAt),
    addressedByUid:
      typeof data.addressedByUid === "string" ? data.addressedByUid : null,
    addressedByEmail:
      typeof data.addressedByEmail === "string" ? data.addressedByEmail : null,
    lastNotifiedAt: asIso(data.lastNotifiedAt),
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

function validateCreateBody(body: unknown):
  | {
      valid: true;
      value: {
        type: ReportRecord["type"];
        source: ReportRecord["source"];
        message: string;
        pageUrl: string | null;
        reporterEmail: string | null;
        userAgent: string | null;
      };
    }
  | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request payload" };
  }

  const candidate = body as Record<string, unknown>;

  if (!isReportType(candidate.type)) {
    return {
      valid: false,
      error: "Invalid report type. Use incorrect_detection, bug, or other.",
    };
  }

  const source = candidate.source;
  if (source !== "website" && source !== "extension") {
    return { valid: false, error: "Invalid report source" };
  }

  const message = normalizeOptionalString(candidate.message);
  if (!message) {
    return { valid: false, error: "Report message is required" };
  }

  if (message.length > 2000) {
    return { valid: false, error: "Report message must be 2000 characters or less" };
  }

  return {
    valid: true,
    value: {
      type: candidate.type,
      source,
      message,
      pageUrl: normalizeOptionalString(candidate.pageUrl),
      reporterEmail: normalizeOptionalString(candidate.reporterEmail)?.toLowerCase() ?? null,
      userAgent: normalizeOptionalString(candidate.userAgent),
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = validateCreateBody(body);

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const authUser = await authenticateOptionalUser(
      request.headers.get("authorization")
    );
    const configuredNotificationInterval =
      getConfiguredReportNotificationInterval();

    const now = FieldValue.serverTimestamp();
    const data = {
      ...validation.value,
      notificationInterval: configuredNotificationInterval,
      status: "open" as const,
      submitterUid: authUser?.uid ?? null,
      submitterEmail: authUser?.email ?? null,
      addressedAt: null,
      addressedByUid: null,
      addressedByEmail: null,
      resolutionNote: null,
      createdAt: now,
      updatedAt: now,
      lastNotifiedAt:
        configuredNotificationInterval === "immediate" ? now : null,
    };

    const ref = await initAdminDb().collection("reports").add(data);

    const reportForEmail: ReportRecord = {
      id: ref.id,
      type: validation.value.type,
      source: validation.value.source,
      status: "open",
      message: validation.value.message,
      pageUrl: validation.value.pageUrl,
      reporterEmail: validation.value.reporterEmail,
      submitterUid: authUser?.uid ?? null,
      submitterEmail: authUser?.email ?? null,
      notificationInterval: configuredNotificationInterval,
      userAgent: validation.value.userAgent,
      resolutionNote: null,
      addressedAt: null,
      addressedByUid: null,
      addressedByEmail: null,
      lastNotifiedAt:
        configuredNotificationInterval === "immediate"
          ? new Date().toISOString()
          : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (configuredNotificationInterval === "immediate") {
      await sendReportSubmittedEmail(reportForEmail);
    }

    return NextResponse.json(
      {
        ok: true,
        reportId: ref.id,
        notificationScheduledFor: configuredNotificationInterval,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ReportAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error ? error.message : "Failed to create report";
    console.error("[reports][POST]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await requireAdminUser(request.headers.get("authorization"));

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") ?? "open";
    const rawLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(100, rawLimit))
      : 50;

    if (statusParam !== "all" && !isReportStatus(statusParam)) {
      return NextResponse.json(
        {
          error:
            "Invalid status. Use open, addressed, or all.",
        },
        { status: 400 }
      );
    }

    const reportsRef = initAdminDb().collection("reports");

    let reports: ReportRecord[] = [];

    if (statusParam === "all") {
      const snap = await reportsRef
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      reports = snap.docs.map((doc) =>
        toReportRecord(doc.id, doc.data() as Record<string, unknown>)
      );
    } else {
      try {
        const snap = await reportsRef
          .where("status", "==", statusParam as ReportStatus)
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();

        reports = snap.docs.map((doc) =>
          toReportRecord(doc.id, doc.data() as Record<string, unknown>)
        );
      } catch (queryError) {
        if (!isMissingIndexError(queryError)) {
          throw queryError;
        }

        const fallbackScanLimit = Math.min(limit * 5, 500);
        const fallbackSnap = await reportsRef
          .orderBy("createdAt", "desc")
          .limit(fallbackScanLimit)
          .get();

        reports = fallbackSnap.docs
          .map((doc) => toReportRecord(doc.id, doc.data() as Record<string, unknown>))
          .filter((report) => report.status === statusParam)
          .slice(0, limit);

        console.warn(
          "[reports][GET] Missing composite index for status+createdAt. Using fallback in-memory filter."
        );
      }
    }

    return NextResponse.json({ reports }, { status: 200 });
  } catch (error) {
    if (error instanceof ReportAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to list reports";
    console.error("[reports][GET]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
