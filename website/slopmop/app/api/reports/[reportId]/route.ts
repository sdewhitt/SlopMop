import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { initAdminDb } from "../../../lib/firebaseAdmin";
import {
  ReportAuthError,
  requireAdminUser,
} from "../../../lib/reportAuth";
import { sendReportAddressedEmail } from "../../../lib/reportEmail";
import {
  isReportStatus,
  normalizeOptionalString,
  type ReportRecord,
} from "../../../lib/reportTypes";

type RouteContext = {
  params: Promise<{ reportId: string }> | { reportId: string };
};

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
      data.notificationInterval === "daily" ||
      data.notificationInterval === "weekly" ||
      data.notificationInterval === "immediate"
        ? data.notificationInterval
        : null,
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

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const adminUser = await requireAdminUser(request.headers.get("authorization"));
    const { reportId } = await context.params;

    if (!reportId) {
      return NextResponse.json({ error: "Missing report ID" }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const status = body.status;

    if (!isReportStatus(status)) {
      return NextResponse.json(
        { error: "Invalid status. Use open or addressed." },
        { status: 400 }
      );
    }

    const resolutionNote = normalizeOptionalString(body.resolutionNote);
    const updateData: Record<string, unknown> = {
      status,
      resolutionNote,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (status === "addressed") {
      updateData.addressedAt = FieldValue.serverTimestamp();
      updateData.addressedByUid = adminUser.uid;
      updateData.addressedByEmail = adminUser.email;
    } else {
      updateData.addressedAt = null;
      updateData.addressedByUid = null;
      updateData.addressedByEmail = null;
    }

    const ref = initAdminDb().collection("reports").doc(reportId);
    const beforeUpdate = await ref.get();

    if (!beforeUpdate.exists) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    await ref.update(updateData);

    const afterUpdate = await ref.get();
    const report = toReportRecord(
      afterUpdate.id,
      afterUpdate.data() as Record<string, unknown>
    );

    if (status === "addressed" && report.reporterEmail) {
      await sendReportAddressedEmail(report);
    }

    return NextResponse.json({ ok: true, report }, { status: 200 });
  } catch (error) {
    if (error instanceof ReportAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to update report";
    console.error("[reports][PATCH]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireAdminUser(request.headers.get("authorization"));
    const { reportId } = await context.params;

    if (!reportId) {
      return NextResponse.json({ error: "Missing report ID" }, { status: 400 });
    }

    const ref = initAdminDb().collection("reports").doc(reportId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    await ref.delete();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ReportAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to delete report";
    console.error("[reports][DELETE]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
