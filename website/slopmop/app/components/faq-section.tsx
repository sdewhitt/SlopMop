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
      className={`border-t border-neutral-200 dark:border-neutral-800 transition-opacity duration-[1500ms] ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="mx-auto max-w-2xl px-6 py-32">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Frequently Asked Questions
        </h2>

        <dl className="mt-10 divide-y divide-neutral-200 dark:divide-neutral-800">
          {faqs.map(({ q, a }, i) => {
            const isOpen = openIndices.has(i);
            return (
              <div key={q} className="py-5">
                <dt>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left text-lg font-semibold"
                    onClick={() => toggle(i)}
                    aria-expanded={isOpen}
                  >
                    {q}
                    <span
                      className={`ml-4 shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-45" : ""
                      }`}
                    >
                      +
                    </span>
                  </button>
                </dt>
                {isOpen && (
                  <dd className="mt-3 text-neutral-600 dark:text-neutral-400">
                    {a}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
