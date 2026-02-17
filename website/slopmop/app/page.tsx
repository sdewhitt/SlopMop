import Link from "next/link";
import Navbar from "./components/navbar";
import Footer from "./components/footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
      <Navbar />

      {/* ── Hero ── */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="max-w-2xl text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
          AI content detection <span className="font-extrabold">built for convenience</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
          Scroll through your social media feeds — with comfort and clarity
        </p>

        {/* ── CTAs ── */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/install"
            className="rounded-full bg-foreground px-8 py-3 text-lg font-semibold text-background transition hover:opacity-80"
          >
            Install
          </Link>
        </div>
      </main>

      {/* ── Features ── */}
      <section className="border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 sm:grid-cols-3">
          <div>
            <h3 className="text-lg font-semibold">Real‑Time Detection</h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Highlights AI‑generated posts as you scroll—no extra clicks
              needed.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Privacy First</h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              All data detections are deleted after 24 hours. We never sell or share your data with third parties.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Open Source</h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Fully transparent codebase. Audit it, fork it, contribute to it.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
