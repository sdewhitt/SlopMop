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
      <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="rounded-3xl border border-white/70 bg-white/80 px-6 py-5 text-center shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          </div>
        </main>
      </div>
    );
  }

  // Not signed in — redirect to login with a return URL
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="w-full max-w-lg rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              Connect Your Extension
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Sign in to your SlopMop account to link your browser extension.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={() => router.push("/login?redirect=/auth/extension")}
                className="rounded-full bg-slate-900 px-8 py-3 text-sm font-semibold text-white shadow-sm shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                Sign In
              </button>
              <button
                onClick={() => router.push("/signup?redirect=/auth/extension")}
                className="text-sm font-semibold text-slate-500 transition hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
              >
                Don&apos;t have an account? Sign up
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Connect Your Extension
          </h1>

          {generating && (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Generating your sign-in code…
            </p>
          )}

          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}

          {customToken && (
            <>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Copy the code below and paste it into your SlopMop browser extension to sign in.
              </p>

              <div className="mt-6 w-full">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
                  <code className="flex-1 break-all text-xs text-slate-700 dark:text-slate-200 max-h-20 overflow-y-auto">
                    {customToken}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="mt-6 max-w-md space-y-2 text-left text-xs text-slate-500 dark:text-slate-400">
                <p>
                  <strong className="text-slate-600 dark:text-slate-300">Step 1:</strong> Copy the code above
                </p>
                <p>
                  <strong className="text-slate-600 dark:text-slate-300">Step 2:</strong> Open the SlopMop extension popup
                </p>
                <p>
                  <strong className="text-slate-600 dark:text-slate-300">Step 3:</strong> Click
                  {" "}
                  &quot;Sign in with code&quot; and paste the code
                </p>
              </div>

              <p className="mt-4 text-[11px] text-slate-400">
                This code expires in 1 hour. Do not share it with anyone.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
