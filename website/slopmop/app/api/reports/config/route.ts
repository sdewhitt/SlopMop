import { NextResponse } from "next/server";
import {
  ReportAuthError,
  requireAdminUser,
} from "../../../lib/reportAuth";
import {
  getReportNotificationSettings,
  updateReportNotificationSettings,
} from "../../../lib/reportConfig";
import { isReportNotificationInterval } from "../../../lib/reportTypes";

export async function GET(request: Request) {
  try {
    await requireAdminUser(request.headers.get("authorization"));
    const settings = await getReportNotificationSettings();

    return NextResponse.json({ settings }, { status: 200 });
  } catch (error) {
    if (error instanceof ReportAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error ? error.message : "Failed to load report settings";
    console.error("[reports][config][GET]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminUser = await requireAdminUser(request.headers.get("authorization"));
    const body = (await request.json()) as Record<string, unknown>;

    if (!isReportNotificationInterval(body.notificationInterval)) {
      return NextResponse.json(
        { error: "Invalid notification interval. Use immediate, daily, or weekly." },
        { status: 400 }
      );
    }

    const settings = await updateReportNotificationSettings(
      body.notificationInterval,
      {
        uid: adminUser.uid,
        email: adminUser.email ?? null,
      }
    );

    return NextResponse.json({ ok: true, settings }, { status: 200 });
  } catch (error) {
    if (error instanceof ReportAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error ? error.message : "Failed to update report settings";
    console.error("[reports][config][PATCH]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
