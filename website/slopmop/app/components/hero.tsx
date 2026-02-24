import Link from "next/link";

export default function Hero() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pt-24 text-center">
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
  );
}
