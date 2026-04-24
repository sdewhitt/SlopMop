import { type DecodedIdToken } from "firebase-admin/auth";
import { initAdmin } from "./firebaseAdmin";

export class ReportAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ReportAuthError";
  }
}

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
}

export function getAdminReportEmails(): string[] {
  const raw =
    process.env.ADMIN_REPORT_EMAILS ?? process.env.REPORT_ADMIN_EMAILS ?? "";

  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function parseBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

async function verifyToken(token: string): Promise<DecodedIdToken> {
  return initAdmin().verifyIdToken(token);
}

export async function authenticateOptionalUser(
  authorizationHeader: string | null
): Promise<AuthenticatedUser | null> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) return null;

  try {
    const decoded = await verifyToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email?.toLowerCase() ?? null,
    };
  } catch {
    throw new ReportAuthError("Invalid authorization token", 401);
  }
}

export async function requireAdminUser(
  authorizationHeader: string | null
): Promise<AuthenticatedUser & { email: string }> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    throw new ReportAuthError("Missing authorization token", 401);
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await verifyToken(token);
  } catch {
    throw new ReportAuthError("Invalid authorization token", 401);
  }

  const email = decoded.email?.toLowerCase();
  if (!email) {
    throw new ReportAuthError("Authenticated user is missing an email", 403);
  }

  const allowlist = getAdminReportEmails();
  if (allowlist.length === 0) {
    throw new ReportAuthError(
      "Admin access is not configured. Set ADMIN_REPORT_EMAILS.",
      500
    );
  }

  if (!allowlist.includes(email)) {
    throw new ReportAuthError("You are not authorized to access reports", 403);
  }

  return {
    uid: decoded.uid,
    email,
  };
}
