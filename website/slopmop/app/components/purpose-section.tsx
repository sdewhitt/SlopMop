const benefits = [
  {
    title: "Ignore the noise",
    description:
      "AI-generated content is everywhere. SlopMop flags it so you can focus on what feels real.",
  },
  {
    title: "Works Everywhere You Scroll",
    description:
      "Runs quietly with no manual checks or extra tabs needed.",
  },
  // {
  //   title: "Instant, Zero-Effort Detection",
  //   description:
  //     "As soon as content appears on your screen, SlopMop analyzes it. No clicks, no configuration.",
  // },
  {
    title: "Your Data is Yours",
    description:
      "Detection data stays private and clears out within 24 hours.",
  },
];

export default function PurposeSection() {
  return (
    <section className="border-t border-slate-200/70 py-20 dark:border-slate-800/70">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Why SlopMop?
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
              The internet is filled with AI-generated text, images, and video. SlopMop runs in your browser and surfaces clear signals while you scroll so you can decide what deserves your attention.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {benefits.map((benefit) => (
                <div
                  key={benefit.title}
                  className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70"
                >
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    {benefit.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {benefit.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              What you get
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">
              A calmer feed in under a minute.
            </h3>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Install once and SlopMop stays on in the background. Labels appear next to posts that look synthetic, along with confidence scores and short context hints.
            </p>
            <div className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-950">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                <span>Instant labels as posts load in your feed.</span>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-950">
                <span className="mt-1 h-2 w-2 rounded-full bg-amber-400" />
                <span>Confidence scores that explain how strong the signal is.</span>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-950">
                <span className="mt-1 h-2 w-2 rounded-full bg-sky-400" />
                <span>Settings that keep the controls right in the popup.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
