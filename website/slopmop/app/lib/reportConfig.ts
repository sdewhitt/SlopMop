import {
  REPORT_NOTIFICATION_INTERVALS,
  type ReportNotificationInterval,
} from "./reportTypes";

const DEFAULT_NOTIFICATION_INTERVAL: ReportNotificationInterval = "immediate";

export function getConfiguredReportNotificationInterval(): ReportNotificationInterval {
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
