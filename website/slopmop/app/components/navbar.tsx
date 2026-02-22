"use client";

import Link from "next/link";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-black/80">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight">
          SlopMop
        </Link>
        <ul className="flex items-center gap-6 text-sm font-medium">
          <li>
            <Link href="/install" className="hover:underline">
              Install
            </Link>
          </li>
          <li>
            <Link href="/faq" className="hover:underline">
              FAQ
            </Link>
          </li>
          {user ? (
            <li>
              <button
                onClick={() => logOut()}
                className="rounded-full bg-foreground px-4 py-1.5 text-background transition hover:opacity-80"
              >
                Sign Out
              </button>
            </li>
          ) : (
            <li>
              <Link
                href="/signup"
                className="rounded-full bg-foreground px-4 py-1.5 text-background transition hover:opacity-80"
              >
                Sign Up
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
