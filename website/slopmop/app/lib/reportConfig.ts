import { FieldValue } from "firebase-admin/firestore";
import { initAdminDb } from "./firebaseAdmin";
import {
  REPORT_NOTIFICATION_INTERVALS,
  isReportNotificationInterval,
  type ReportNotificationSettings,
  type ReportNotificationInterval,
} from "./reportTypes";

const DEFAULT_NOTIFICATION_INTERVAL: ReportNotificationInterval = "immediate";
const SETTINGS_COLLECTION = "reportConfig";
const SETTINGS_DOC_ID = "notifications";

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

function getDefaultIntervalFromEnv(): ReportNotificationInterval {
  const raw =
    process.env.REPORT_NOTIFICATION_INTERVAL ??
    process.env.REPORT_DEFAULT_NOTIFICATION_INTERVAL;

  if (!raw) return DEFAULT_NOTIFICATION_INTERVAL;

  const candidate = raw.trim().toLowerCase();

  if (
    REPORT_NOTIFICATION_INTERVALS.includes(
      candidate as ReportNotificationInterval
    )
  ) {
    return candidate as ReportNotificationInterval;
  }

  console.warn(
    `[reports] Invalid REPORT_NOTIFICATION_INTERVAL=${raw}. Falling back to ${DEFAULT_NOTIFICATION_INTERVAL}.`
  );

  return DEFAULT_NOTIFICATION_INTERVAL;
}

function toSettings(
  data: Record<string, unknown> | undefined
): ReportNotificationSettings {
  return {
    notificationInterval: isReportNotificationInterval(data?.notificationInterval)
      ? data.notificationInterval
      : getDefaultIntervalFromEnv(),
    updatedAt: asIso(data?.updatedAt),
    updatedByUid:
      typeof data?.updatedByUid === "string" ? data.updatedByUid : null,
    updatedByEmail:
      typeof data?.updatedByEmail === "string" ? data.updatedByEmail : null,
  };
}

export async function getReportNotificationSettings(): Promise<ReportNotificationSettings> {
  const snap = await initAdminDb()
    .collection(SETTINGS_COLLECTION)
    .doc(SETTINGS_DOC_ID)
    .get();

  if (!snap.exists) {
    return {
      notificationInterval: getDefaultIntervalFromEnv(),
      updatedAt: null,
      updatedByUid: null,
      updatedByEmail: null,
    };
  }

  return toSettings(snap.data() as Record<string, unknown>);
}

export async function getConfiguredReportNotificationInterval(): Promise<ReportNotificationInterval> {
  const settings = await getReportNotificationSettings();
  return settings.notificationInterval;
}

export async function updateReportNotificationSettings(
  interval: ReportNotificationInterval,
  adminUser: { uid: string; email: string | null }
): Promise<ReportNotificationSettings> {
  const ref = initAdminDb().collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID);

  await ref.set(
    {
      notificationInterval: interval,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: adminUser.uid,
      updatedByEmail: adminUser.email,
    },
    { merge: true }
  );

  const saved = await ref.get();
  return toSettings(saved.data() as Record<string, unknown> | undefined);
}
