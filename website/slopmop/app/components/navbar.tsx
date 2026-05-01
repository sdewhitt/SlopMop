"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logOut } = useAuth();
  const [adminAccess, setAdminAccess] = useState<
    "unknown" | "authorized" | "unauthorized"
  >("unknown");

  useEffect(() => {
    let isActive = true;

    if (!user) {
      setAdminAccess("unauthorized");
      return () => {
        isActive = false;
      };
    }

    if (typeof user.getIdToken !== "function") {
      setAdminAccess("unauthorized");
      return () => {
        isActive = false;
      };
    }

    setAdminAccess("unknown");

    const checkAdmin = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/reports/config", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!isActive) return;

        if (res.ok) {
          setAdminAccess("authorized");
          return;
        }

        setAdminAccess("unauthorized");
      } catch {
        if (!isActive) return;
        setAdminAccess("unauthorized");
      }
    };

    void checkAdmin();

    return () => {
      isActive = false;
    };
  }, [user]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/75 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/75">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="group inline-flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-sm font-bold text-white shadow-sm shadow-slate-900/30 transition group-hover:-rotate-2 dark:bg-white dark:text-slate-900">
            SM
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">SlopMop</span>
        </Link>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-4 text-sm font-medium text-slate-700 dark:text-slate-200">
          <Link href="/install" className="transition hover:text-slate-900 dark:hover:text-white">
            Install
          </Link>
          <Link href="/report" className="transition hover:text-slate-900 dark:hover:text-white">
            Report
          </Link>
          <a href="/#faq" className="transition hover:text-slate-900 dark:hover:text-white">
            FAQ
          </a>
          {user ? (
            <>
              <Link href="/settings" className="transition hover:text-slate-900 dark:hover:text-white">
                Settings
              </Link>
              {adminAccess === "authorized" ? (
                <Link href="/admin/reports" className="transition hover:text-slate-900 dark:hover:text-white">
                  Admin Reports
                </Link>
              ) : null}
              <button
                onClick={() => logOut()}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/signup"
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              Sign Up
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
