import Link from "next/link";

export const metadata = {
  title: "FAQ — SlopMop",
};

const faqs = [
  {
    q: "sample question1",
    a: "sample answer",
  },
  {
    q: "sample question2",
    a: "sample answer",
  },
  {
    q: "sample question3",
    a: "sample answer",
  },
  {
    q: "sample question4",
    a: "sample answer",
  },
  {
    q: "sample question5",
    a: "sample answer",
  },
];

export default function FAQPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight">
        Frequently Asked Questions
      </h1>

      <dl className="mt-10 space-y-8">
        {faqs.map(({ q, a }) => (
          <div key={q}>
            <dt className="text-lg font-semibold">{q}</dt>
            <dd className="mt-2 text-neutral-600 dark:text-neutral-400">{a}</dd>
          </div>
        ))}
      </dl>

      <Link href="/" className="mt-12 text-sm text-neutral-500 hover:underline">
        ← Back to home
      </Link>
    </div>
  );
}
