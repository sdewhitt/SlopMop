import { NextRequest, NextResponse } from "next/server";
import { initAdmin } from "../../lib/firebaseAdmin";

/**
 * POST /api/extension-token
 *
 * Accepts a Firebase ID token (from a website-authenticated user) and returns
 * a custom token that the browser extension can use with signInWithCustomToken().
 *
 * Body: { "idToken": "<Firebase ID token>" }
 * Returns: { "customToken": "<custom token>" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid idToken" },
        { status: 400 }
      );
    }

    const adminAuth = initAdmin();

    // Verify the ID token to get the user's UID
    const decoded = await adminAuth.verifyIdToken(idToken);

    // Generate a custom token for the extension to use
    const customToken = await adminAuth.createCustomToken(decoded.uid);

    return NextResponse.json({ customToken });
  } catch (err: unknown) {
    console.error("[extension-token] Error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to generate token";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
