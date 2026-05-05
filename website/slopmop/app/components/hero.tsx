import Link from "next/link";

export default function Hero() {
  return (
    <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-12 px-6 pb-16 pt-24 text-center lg:items-start lg:text-left">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-8 -z-10 h-[420px] rounded-[36px] bg-gradient-to-br from-amber-200/60 via-white/40 to-sky-200/50 blur-3xl dark:from-amber-400/20 dark:via-slate-900/20 dark:to-cyan-400/20"
      />

      <div className="flex w-full max-w-3xl flex-col gap-6 motion-safe:animate-[fade-up_0.9s_ease-out]">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 shadow-sm dark:border-slate-800/60 dark:bg-slate-950/70 dark:text-slate-300">
          Signal over noise
        </span>

        <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-slate-950 dark:text-white sm:text-6xl">
          See AI-made posts before they steer the conversation.
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-300">
          SlopMop scans your social feeds asynchronously and highlights content that looks synthetic once analysis completes. You keep scrolling with clarity.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/install"
            className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            Install for Chrome
          </Link>
          <Link
            href="/#install"
            className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-500"
          >
            How it works
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/70">
            Background detection
          </div>
          <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/70">
            No browsing history stored
          </div>
          <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/70">
            Works where you scroll
          </div>
        </div>
      </div>
    </main>
  );
}
