"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../../components/navbar";
import { useAuth } from "../../context/AuthContext";
import { auth as firebaseAuth } from "../../lib/firebase";

/**
 * /auth/extension — Authenticates the user and provides a custom token
 * that the browser extension can use to sign in.
 *
 * Flow:
 * 1. User clicks "Sign in with SlopMop" in the extension
 * 2. Extension opens this page in a new browser tab
 * 3. User logs in (or is already logged in) on the website
 * 4. This page generates a custom token via the API and displays it
 * 5. User copies the token and pastes it in the extension
 */
export default function ExtensionAuthPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [customToken, setCustomToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Once the user is signed in, generate the token automatically
  useEffect(() => {
    if (!user || !firebaseAuth) return;

    let cancelled = false;

    const generateToken = async () => {
      setGenerating(true);
      setError("");
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/extension-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to generate token");
        if (!cancelled) setCustomToken(data.customToken);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to generate token"
          );
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    };

    generateToken();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleCopy = async () => {
    if (!customToken) return;
    await navigator.clipboard.writeText(customToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-sm text-neutral-500">Loading…</p>
        </main>
      </div>
    );
  }

  // Not signed in — redirect to login with a return URL
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
        <Navbar />
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight">
            Connect Your Extension
          </h1>
          <p className="max-w-md text-sm text-neutral-500">
            Sign in to your SlopMop account to link your browser extension.
          </p>
          <button
            onClick={() => router.push("/login?redirect=/auth/extension")}
            className="rounded-full bg-foreground px-8 py-3 font-semibold text-background transition hover:opacity-80"
          >
            Sign In
          </button>
          <button
            onClick={() => router.push("/signup?redirect=/auth/extension")}
            className="text-sm text-neutral-500 hover:underline"
          >
            Don&apos;t have an account? Sign up
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center gap-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Connect Your Extension
        </h1>

        {generating && (
          <p className="text-sm text-neutral-500">
            Generating your sign-in code…
          </p>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        {customToken && (
          <>
            <p className="max-w-md text-sm text-neutral-500">
              Copy the code below and paste it into your SlopMop browser
              extension to sign in.
            </p>

            <div className="w-full max-w-md">
              <div className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900">
                <code className="flex-1 break-all text-xs text-neutral-700 dark:text-neutral-300 max-h-20 overflow-y-auto">
                  {customToken}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-80"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="max-w-md space-y-2 text-left text-xs text-neutral-400">
              <p>
                <strong className="text-neutral-500">Step 1:</strong> Copy the
                code above
              </p>
              <p>
                <strong className="text-neutral-500">Step 2:</strong> Open the
                SlopMop extension popup
              </p>
              <p>
                <strong className="text-neutral-500">Step 3:</strong> Click
                &quot;Sign in with code&quot; and paste the code
              </p>
            </div>

            <p className="text-[11px] text-neutral-400">
              This code expires in 1 hour. Do not share it with anyone.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
