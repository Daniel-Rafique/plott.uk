"use client";

// PLACEHOLDER CONTENT — the three quotes below are illustrative of the
// audiences we serve, attributed to anonymised generic roles. Replace each
// entry with a real, named customer quote once we have permission to use one.
// The structure and animation are production-ready.

import { useCallback, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTextReveal } from "@/lib/animation/use-text-reveal";
import { useGsapReveal } from "@/lib/animation/use-gsap-reveal";

type Testimonial = {
  quote: string;
  role: string;
  region: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "We've replaced two paid subscriptions and a spreadsheet workflow with Plott. My BD team starts every Monday with a curated patch of live applications, already enriched. We've doubled outreach volume without hiring.",
    role: "Business Development Director",
    region: "Mid-size London contractor",
  },
  {
    quote:
      "The letter generation alone is worth it. We were drafting A4 outreach in Word, merging addresses by hand. Now it's one click per lead, properly branded, and ready for the post room. Thirty seconds instead of twenty minutes.",
    role: "Planning Consultant",
    region: "South-East England",
  },
  {
    quote:
      "Photorealistic 3D on top of live applications is a genuinely new capability. Before we visit a site we've already seen the rooflines, the access, and the neighbours. It changes how we prepare for meetings.",
    role: "Commercial Lead",
    region: "Roofing & envelope contractor",
  },
];

export function Testimonials() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const quoteRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useTextReveal<HTMLHeadingElement>();
  const introRef = useGsapReveal<HTMLDivElement>({ stagger: 0.06 });

  const go = useCallback((next: number, dir: 1 | -1) => {
    setDirection(dir);
    setIndex(((next % TESTIMONIALS.length) + TESTIMONIALS.length) % TESTIMONIALS.length);
  }, []);

  useEffect(() => {
    const el = quoteRef.current;
    if (!el) return;

    const mm = gsap.matchMedia();
    mm.add(
      {
        reduced: "(prefers-reduced-motion: reduce)",
        normal: "(prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const reduced = ctx.conditions?.reduced ?? false;
        if (reduced) {
          gsap.set(el, { opacity: 1, x: 0 });
          return;
        }
        gsap.fromTo(
          el,
          { opacity: 0, x: 40 * direction },
          { opacity: 1, x: 0, duration: 0.6, ease: "power2.out" },
        );
      },
    );
    return () => mm.revert();
  }, [index, direction]);

  const current = TESTIMONIALS[index];
  const paginationLabel = `${String(index + 1).padStart(2, "0")} / ${String(
    TESTIMONIALS.length,
  ).padStart(2, "0")}`;

  return (
    <section
      data-stack
      data-bg="#ffffff"
      className="relative flex min-h-[100svh] items-center bg-white"
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:py-28">
        <div ref={introRef} className="editorial-hairline max-w-3xl pt-10">
          <p
            data-reveal
            className="editorial-chapter-label text-brand-dark"
          >
            04 — Client stories
          </p>
          <h2
            ref={headingRef}
            className="mt-6 font-[family-name:var(--font-display)] text-[clamp(36px,5vw,68px)] font-normal leading-[1.1] tracking-tight text-zinc-950"
          >
            What teams running live pipelines tell us.
          </h2>
        </div>

        <div className="mt-20 grid min-w-0 grid-cols-1 gap-14 md:grid-cols-[1fr_auto] md:items-end md:gap-20">
          <div
            ref={quoteRef}
            className="relative min-w-0 overflow-x-clip pl-1 sm:pl-0"
          >
            <span
              aria-hidden
              className="absolute -left-1 -top-10 font-[family-name:var(--font-display)] text-[100px] leading-none text-brand-light/40 sm:-left-4 sm:-top-10 sm:text-[160px] md:-left-6"
            >
              &ldquo;
            </span>
            <blockquote className="relative max-w-2xl">
              <p className="font-[family-name:var(--font-display)] text-[clamp(24px,2.8vw,38px)] font-normal leading-[1.25] tracking-tight text-zinc-950">
                {current.quote}
              </p>
              <footer className="mt-8 text-[13px] text-zinc-600">
                <span className="font-medium text-zinc-900">
                  {current.role}
                </span>
                <span className="px-2 text-zinc-300" aria-hidden>
                  ·
                </span>
                <span>{current.region}</span>
              </footer>
            </blockquote>
          </div>

          <div className="flex items-center gap-6">
            <span className="editorial-chapter-label tabular-nums text-zinc-500">
              {paginationLabel}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go(index - 1, -1)}
                aria-label="Previous testimonial"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-950"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1, 1)}
                aria-label="Next testimonial"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-900 bg-zinc-900 text-white transition-colors hover:border-zinc-700 hover:bg-zinc-700"
              >
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
