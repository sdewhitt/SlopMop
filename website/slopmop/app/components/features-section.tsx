const features = [
  {
    title: "Real-time detection",
    description: "Signals appear as you scroll so you can judge a post instantly.",
    tag: "Live",
    note: "Signals are probability based, not definitive verdicts.",
  },
  {
    title: "Privacy first",
    description:
      "Detections are removed within 24 hours. No browsing history is stored or sold.",
    tag: "Private",
  },
  {
    title: "Transparent by design",
    description:
      "Open documentation, clear labels, and a settings page that puts you in control.",
    tag: "Clear",
  },
];

export default function FeaturesSection() {
  return (
    <section className="border-t border-slate-200/70 bg-white/60 py-20 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/40">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Designed for clarity, not noise.
            </h2>
            <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
              SlopMop keeps your feed readable with quick, lightweight signals that stay out of your way.
            </p>
          </div>
          <span className="w-fit rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm dark:border-slate-800/60 dark:bg-slate-950/70 dark:text-slate-300">
            Built for speed
          </span>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-3xl border border-white/70 bg-white/80 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-slate-800/70 dark:bg-slate-950/70"
            >
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                <span>{feature.tag}</span>
                <span className="h-2 w-2 rounded-full bg-amber-400" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-slate-950 dark:text-white">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {feature.description}
              </p>
              {feature.note ? (
                <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-200">
                  {feature.note}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
