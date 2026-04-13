import type {
  ReportNotificationInterval,
  ReportRecord,
} from "./reportTypes";
import { getAdminReportEmails } from "./reportAuth";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type EmailParams = {
  to: string[];
  subject: string;
  text: string;
  html: string;
};

function getResendConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) return null;

  return { apiKey, from };
}

async function sendEmail(params: EmailParams): Promise<boolean> {
  const config = getResendConfig();
  if (!config) return false;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[report-email] Failed to send email:", body);
    return false;
  }

  return true;
}

function toPrettyType(type: ReportRecord["type"]): string {
  return type.replace("_", " ");
}

export async function sendReportSubmittedEmail(
  report: ReportRecord
): Promise<boolean> {
  const recipients = getAdminReportEmails();
  if (recipients.length === 0) return false;

  const subject = `[SlopMop] New ${toPrettyType(report.type)} report`;
  const text = [
    "A new report has been submitted.",
    `Report ID: ${report.id}`,
    `Type: ${report.type}`,
    `Source: ${report.source}`,
    `Message: ${report.message}`,
    `Page URL: ${report.pageUrl ?? "(none)"}`,
    `Reporter Email: ${report.reporterEmail ?? "(none)"}`,
    `Submitter Email: ${report.submitterEmail ?? "(anonymous)"}`,
    `Notification Interval: ${report.notificationInterval}`,
    `Created At: ${report.createdAt ?? "(pending timestamp)"}`,
  ].join("\n");

  const html = `
    <h2>New SlopMop Report</h2>
    <p><strong>Report ID:</strong> ${report.id}</p>
    <p><strong>Type:</strong> ${report.type}</p>
    <p><strong>Source:</strong> ${report.source}</p>
    <p><strong>Message:</strong><br/>${report.message}</p>
    <p><strong>Page URL:</strong> ${report.pageUrl ?? "(none)"}</p>
    <p><strong>Reporter Email:</strong> ${report.reporterEmail ?? "(none)"}</p>
    <p><strong>Submitter Email:</strong> ${report.submitterEmail ?? "(anonymous)"}</p>
    <p><strong>Notification Interval:</strong> ${report.notificationInterval}</p>
    <p><strong>Created At:</strong> ${report.createdAt ?? "(pending timestamp)"}</p>
  `;

  return sendEmail({
    to: recipients,
    subject,
    text,
    html,
  });
}

export async function sendReportAddressedEmail(
  report: ReportRecord
): Promise<boolean> {
  if (!report.reporterEmail) return false;

  const subject = "[SlopMop] Your report has been addressed";
  const text = [
    "Your SlopMop report has been marked as addressed.",
    `Report ID: ${report.id}`,
    `Type: ${report.type}`,
    `Status: ${report.status}`,
    `Resolution Note: ${report.resolutionNote ?? "(none)"}`,
  ].join("\n");

  const html = `
    <h2>Your report was addressed</h2>
    <p>Thanks for helping improve SlopMop.</p>
    <p><strong>Report ID:</strong> ${report.id}</p>
    <p><strong>Type:</strong> ${report.type}</p>
    <p><strong>Status:</strong> ${report.status}</p>
    <p><strong>Resolution Note:</strong> ${report.resolutionNote ?? "(none)"}</p>
  `;

  return sendEmail({
    to: [report.reporterEmail],
    subject,
    text,
    html,
  });
}

export async function sendDigestEmail(
  interval: ReportNotificationInterval,
  reports: ReportRecord[]
): Promise<boolean> {
  const recipients = getAdminReportEmails();
  if (recipients.length === 0 || reports.length === 0) return false;

  const subject = `[SlopMop] ${interval} report digest (${reports.length})`;

  const textLines = [
    `You have ${reports.length} open reports in this ${interval} digest.`,
    "",
    ...reports.map(
      (report) =>
        `#${report.id} [${report.type}] ${report.message.slice(0, 140)}`
    ),
  ];

  const htmlItems = reports
    .map(
      (report) =>
        `<li><strong>${report.id}</strong> [${report.type}] ${report.message}</li>`
    )
    .join("");

  return sendEmail({
    to: recipients,
    subject,
    text: textLines.join("\n"),
    html: `<h2>${interval} report digest</h2><p>${reports.length} open reports.</p><ul>${htmlItems}</ul>`,
  });
}
