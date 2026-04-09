export const REPORT_TYPES = ["incorrect_detection", "bug", "other"] as const;
export const REPORT_SOURCES = ["website", "extension"] as const;
export const REPORT_STATUSES = ["open", "addressed"] as const;
export const REPORT_NOTIFICATION_INTERVALS = [
  "immediate",
  "daily",
  "weekly",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportSource = (typeof REPORT_SOURCES)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type ReportNotificationInterval =
  (typeof REPORT_NOTIFICATION_INTERVALS)[number];

export interface CreateReportPayload {
  type: ReportType;
  source: ReportSource;
  message: string;
  pageUrl?: string;
  reporterEmail?: string;
  notificationInterval?: ReportNotificationInterval;
  userAgent?: string;
}

export interface ReportRecord {
  id: string;
  type: ReportType;
  source: ReportSource;
  status: ReportStatus;
  message: string;
  pageUrl: string | null;
  reporterEmail: string | null;
  submitterUid: string | null;
  submitterEmail: string | null;
  notificationInterval: ReportNotificationInterval;
  userAgent: string | null;
  resolutionNote: string | null;
  addressedAt: string | null;
  addressedByUid: string | null;
  addressedByEmail: string | null;
  lastNotifiedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function isReportType(value: unknown): value is ReportType {
  return typeof value === "string" && REPORT_TYPES.includes(value as ReportType);
}

export function isReportSource(value: unknown): value is ReportSource {
  return (
    typeof value === "string" && REPORT_SOURCES.includes(value as ReportSource)
  );
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return (
    typeof value === "string" && REPORT_STATUSES.includes(value as ReportStatus)
  );
}

export function isReportNotificationInterval(
  value: unknown
): value is ReportNotificationInterval {
  return (
    typeof value === "string" &&
    REPORT_NOTIFICATION_INTERVALS.includes(value as ReportNotificationInterval)
  );
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
