import Link from "next/link";
import Navbar from "../components/navbar";
import faqs from "@/app/data/faqs.json";

export const metadata = {
  title: "FAQ — SlopMop",
};

export default function FAQPage() {
  return (
    <div className="flex min-h-screen flex-col bg-transparent text-slate-950 dark:text-slate-100">
      <Navbar />
      <main className="mx-auto flex flex-1 flex-col max-w-4xl px-6 py-24">
        <div className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Frequently Asked Questions
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
            Quick answers about accuracy, privacy, supported platforms, and troubleshooting.
          </p>

          <dl className="mt-10 space-y-8">
            {faqs.map(({ q, a }) => (
              <div key={q}>
                <dt className="text-lg font-semibold text-slate-900 dark:text-white">{q}</dt>
                <dd className="mt-2 text-sm text-slate-600 dark:text-slate-300">{a}</dd>
              </div>
            ))}
          </dl>

          <Link href="/" className="mt-12 inline-flex text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
