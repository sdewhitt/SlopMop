import Link from "next/link";
import ViewOnboardingAgainButton from "./view-onboarding-again-button";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200/70 py-10 dark:border-slate-800/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6">
        <div className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-2xl font-semibold text-slate-950 dark:text-white">
                Ready to mop the feed?
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Install in minutes and keep the signal clear while you browse.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/install"
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                Install
              </Link>
              <Link
                href="/signup"
                className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-500"
              >
                Create account
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 border-t border-slate-200/70 pt-6 text-sm text-slate-500 dark:border-slate-800/70 dark:text-slate-400 md:flex-row md:items-center md:justify-between">
          <span>&copy; {new Date().getFullYear()} SlopMop</span>
          <div className="flex flex-wrap gap-4">
            <a href="/#faq" className="transition hover:text-slate-900 dark:hover:text-white">
              FAQ
            </a>
            <Link href="/report" className="transition hover:text-slate-900 dark:hover:text-white">
              Report
            </Link>
            <Link href="/install" className="transition hover:text-slate-900 dark:hover:text-white">
              Install
            </Link>
            <Link href="/settings" className="transition hover:text-slate-900 dark:hover:text-white">
              Settings
            </Link>
            <Link href="/signup" className="transition hover:text-slate-900 dark:hover:text-white">
              Sign Up
            </Link>
          </div>
        </div>

        <div className="text-center">
          <ViewOnboardingAgainButton />
        </div>
      </div>
    </footer>
  );
}
