export default function FeaturesSection() {
  return (
    <section className="border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 pt-44 pb-20 sm:grid-cols-3">
        <div>
          <h3 className="text-lg font-semibold">Real-Time Detection</h3>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Detects as you scroll — no clicks needed.
          </p>
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 font-medium">
            ⚠️ <strong>Note:</strong> Detection results are probability-based estimates, not definitive determinations.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-semibold">Privacy First</h3>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            All data detections are deleted after 24 hours. We never sell or share your data with third parties.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-semibold">Transparency</h3>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Fully transparent codebase.
          </p>
        </div>
      </div>
    </section>
  );
}
