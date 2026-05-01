import Link from "next/link";

const steps = [
  {
    number: 1,
    title: "Visit the Chrome Web Store",
    description:
      "Search for \"SlopMop\" or click the direct link to our extension page.",
  },
  {
    number: 2,
    title: "Add to Chrome",
    description:
      "Click the \"Add to Chrome\" button, then confirm by clicking \"Add extension\" in the popup.",
  },
  {
    number: 3,
    title: "Pin to toolbar",
    description:
      "Click the puzzle piece icon in your Chrome toolbar and pin SlopMop for easy access.",
  },
  {
    number: 4,
    title: "Sign in and start detecting",
    description:
      "Click the SlopMop icon, create an account or sign in, and browse as usual — AI content gets flagged automatically.",
  },
];

export default function InstallStepsSection() {
  return (
    <section
      id="install"
      className="border-t border-slate-200/70 bg-white/70 py-20 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/40"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Get started in just a few minutes
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
              Follow the steps below to install SlopMop and start detecting AI-generated content in your feed.
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70 dark:text-slate-300">
            Chrome ready
          </div>
        </div>

        <ol className="relative mt-12 space-y-6">
          {steps.map((step, index) => (
            <li
              key={step.number}
              className="relative rounded-3xl border border-white/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70"
            >
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white shadow-sm shadow-slate-900/30 dark:bg-white dark:text-slate-900">
                  {step.number}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {step.description}
                  </p>
                </div>
              </div>
              {index !== steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute left-11 top-14 h-[calc(100%+24px)] w-px bg-slate-200/70 dark:bg-slate-700/70"
                />
              ) : null}
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/install"
            className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            Full install guide
          </Link>
          <Link
            href="/signup"
            className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-500"
          >
            Create account
          </Link>
        </div>
      </div>
    </section>
  );
}
