"use client";

import { useState, useEffect, useRef } from "react";
import faqs from "@/app/data/faqs.json";

export default function FAQSection() {
  const [openIndices, setOpenIndices] = useState<Set<number>>(new Set());
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const toggle = (i: number) => {
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <section
      ref={sectionRef}
      id="faq"
      className={`border-t border-slate-200/70 py-20 transition-opacity duration-1500 dark:border-slate-800/70 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
              Quick answers to the most common questions about accuracy, privacy, and installation.
            </p>
            <div className="mt-6 rounded-2xl border border-white/70 bg-white/80 p-4 text-sm text-slate-600 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70 dark:text-slate-300">
              Still stuck? Visit the install guide or send a report from the extension popup.
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
            <dl className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {faqs.map(({ q, a }, i) => {
                const isOpen = openIndices.has(i);
                return (
                  <div key={q} className="py-5">
                    <dt>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between text-left text-base font-semibold text-slate-900 transition hover:text-slate-950 dark:text-white"
                        onClick={() => toggle(i)}
                        aria-expanded={isOpen}
                      >
                        {q}
                        <span
                          className={`ml-4 shrink-0 text-lg transition-transform duration-200 ${
                            isOpen ? "rotate-45" : ""
                          }`}
                        >
                          +
                        </span>
                      </button>
                    </dt>
                    {isOpen && (
                      <dd className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                        {a}
                      </dd>
                    )}
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
