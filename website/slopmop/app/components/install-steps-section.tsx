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
    <section className="border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl px-6 py-20">
        {/* Header */}
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Get started in just a few minutes
          </h2>
          <p className="mt-4 text-neutral-600 dark:text-neutral-400">
            Follow the guide below to
            start detecting AI-generated content in your feed.
          </p>
        </div>

        {/* Steps */}
        <ol className="mt-12 space-y-6">
          {steps.map((step) => (
            <li
              key={step.number}
              className="flex gap-5 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
                {step.number}
              </span>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* CTA */}
        <div className="mt-10">
          <Link
            href="/install"
            className="inline-block rounded-full bg-foreground px-8 py-3 text-sm font-semibold text-background transition hover:opacity-80"
          >
            Full install guide →
          </Link>
        </div>
      </div>
    </section>
  );
}
