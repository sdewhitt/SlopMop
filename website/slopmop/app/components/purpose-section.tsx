const benefits = [
  {
    title: "Ignore the noise",
    description:
      "AI-generated content is all over social media feeds. SlopMop flags it so you can focus on what's real.",
  },
  {
    title: "Works Everywhere You Scroll",
    description:
      "Runs quietly, no having to manually check or switch tabs.",
  },
  // {
  //   title: "Instant, Zero-Effort Detection",
  //   description:
  //     "As soon as content appears on your screen, SlopMop analyzes it. No clicks, no configuration.",
  // },
  {
    title: "Your Data is Yours",
    description:
      "Detection data is never shared and everything is cleared within 24 hours.",
  },
];

export default function PurposeSection() {
  return (
    <section className="border-t border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto max-w-5xl px-6 py-20">
        {/* Header */}
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Why SlopMop?
          </h2>
          <p className="mt-4 text-neutral-600 dark:text-neutral-400">
            The internet is increasingly filled with AI-generated text, images,
            and video designed to look authentic. SlopMop is a browser extension
            that detects this content in real time — right inside your social
            media feed — so you always know what you&apos;re actually reading.
          </p>
        </div>

        {/* Benefits grid */}
        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-950"
            >
              <h3 className="text-lg font-semibold">{benefit.title}</h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
