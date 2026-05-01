import Link from "next/link";

export default function Hero() {
  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-12 px-6 pb-16 pt-24 lg:flex-row lg:items-start">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-8 -z-10 h-[420px] rounded-[36px] bg-gradient-to-br from-amber-200/60 via-white/40 to-sky-200/50 blur-3xl dark:from-amber-400/20 dark:via-slate-900/20 dark:to-cyan-400/20"
      />

      <div className="flex w-full max-w-xl flex-col gap-6 motion-safe:animate-[fade-up_0.9s_ease-out]">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 shadow-sm dark:border-slate-800/60 dark:bg-slate-950/70 dark:text-slate-300">
          Signal over noise
        </span>

        <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-slate-950 dark:text-white sm:text-6xl">
          See AI-made posts before they steer the conversation.
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-300">
          SlopMop scans your social feeds in real time and highlights content that looks synthetic. You keep scrolling with clarity.
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
            Real-time detection
          </div>
          <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/70">
            No browsing history stored
          </div>
          <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/70">
            Works where you scroll
          </div>
        </div>
      </div>

      <div className="relative w-full max-w-lg motion-safe:animate-[fade-up_1.1s_ease-out]">
        <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[32px] bg-gradient-to-br from-amber-200/60 via-white/40 to-sky-200/50 blur-2xl dark:from-amber-400/20 dark:via-slate-900/10 dark:to-cyan-400/20" />
        <div className="relative rounded-3xl border border-white/70 bg-white/80 p-6 shadow-[0_25px_60px_rgba(15,23,42,0.18)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            <span>Live feed</span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-400/20 dark:text-amber-200">
              Scanning
            </span>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-950">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-900 dark:text-white">
                Travel thread
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200">
                  Likely human
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Confidence 82 percent
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-300/30 dark:bg-amber-400/10">
              <div className="flex items-center justify-between text-sm font-semibold text-amber-900 dark:text-amber-100">
                Productivity tips
                <span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-semibold text-amber-900 dark:bg-amber-300/30 dark:text-amber-100">
                  Likely AI
                </span>
              </div>
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                Confidence 71 percent
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-950">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-900 dark:text-white">
                Comment thread
                <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-semibold text-sky-700 dark:bg-sky-400/20 dark:text-sky-200">
                  Review
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Confidence 54 percent
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm dark:border-slate-800/70 dark:bg-slate-950 dark:text-slate-300">
            <span>Extensions active</span>
            <span className="font-semibold text-slate-900 dark:text-white">Chrome</span>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 motion-safe:animate-[float-y_6s_ease-in-out_infinite]" />
            Live detection updates every few seconds.
          </div>
        </div>
      </div>
    </main>
  );
}
