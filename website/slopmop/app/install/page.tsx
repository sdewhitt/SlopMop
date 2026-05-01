import Link from "next/link";
import Navbar from "../components/navbar";

export const metadata = {
  title: "Install — SlopMop",
};

export default function InstallPage() {
  return (
    <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
      <Navbar />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="w-full rounded-3xl border border-white/70 bg-white/80 p-10 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Install SlopMop
          </h1>
          <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
            Get SlopMop for your browser in seconds. Chrome is ready now and Firefox is next.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              href="#"
              className="rounded-full bg-slate-900 px-8 py-3 text-sm font-semibold text-white shadow-sm shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              Chrome Web Store
            </a>
            <span className="rounded-full border border-slate-300 px-8 py-3 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Firefox Add-ons (coming soon)
            </span>
          </div>

          <Link
            href="/"
            className="mt-8 inline-flex text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
