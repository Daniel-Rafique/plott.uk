"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useGsapReveal } from "@/lib/animation/use-gsap-reveal";
import { useTextReveal } from "@/lib/animation/use-text-reveal";

type Stat = {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  sublabel: string;
};

const STATS: Stat[] = [
  {
    value: 2.4,
    suffix: "M",
    label: "Planning applications indexed",
    sublabel: "Updated daily from the national dataset",
  },
  {
    value: 337,
    label: "Local planning authorities",
    sublabel: "England-wide coverage",
  },
  {
    value: 94,
    suffix: "%",
    label: "Applicant match rate",
    sublabel: "Multi-source enrichment pipeline",
  },
  {
    value: 48,
    suffix: "h",
    label: "Digest cadence",
    sublabel: "New leads every two working days",
  },
];

function Counter({
  stat,
  inView,
}: {
  stat: Stat;
  inView: boolean;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? stat.value : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, stat.value, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
      onComplete: () => setDisplay(stat.value),
    });
    return () => controls.stop();
  }, [inView, stat.value, reduce]);

  const formatted =
    stat.value % 1 === 0
      ? Math.round(display).toLocaleString()
      : display.toFixed(1);

  return (
    <span className="tabular-nums">
      {stat.prefix}
      {formatted}
      {stat.suffix}
    </span>
  );
}

function StatBlock({
  stat,
  hairlineClass,
}: {
  stat: Stat;
  hairlineClass: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Observe the whole card (not the inner number span). A tight rootMargin on
  // a tiny inline box fails on mobile with Lenis + GSAP-hidden parents.
  const inView = useInView(ref, { once: true, amount: "some" });

  return (
    <div ref={ref} data-reveal className={`flex flex-col pt-8 ${hairlineClass}`}>
      <span className="font-[family-name:var(--font-display)] text-[clamp(56px,7vw,104px)] font-normal leading-[0.95] tracking-tight text-zinc-950">
        <Counter stat={stat} inView={inView} />
      </span>
      <div className="mt-6 text-[14px] font-medium text-zinc-900">{stat.label}</div>
      <div className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
        {stat.sublabel}
      </div>
    </div>
  );
}

export function ByTheNumbers() {
  const ref = useGsapReveal<HTMLDivElement>({ stagger: 0.06 });
  const headingRef = useTextReveal<HTMLHeadingElement>();

  return (
    <section
      data-stack
      data-bg="#fafaf9"
      className="relative flex min-h-[100svh] items-center bg-stone-50"
    >
      <div ref={ref} className="mx-auto w-full max-w-7xl px-6 py-24 md:py-28">
        <div className="editorial-hairline pt-10">
          <p
            data-reveal
            className="editorial-chapter-label text-brand-dark"
          >
            01 — By the numbers
          </p>
          <h2
            ref={headingRef}
            className="mt-6 max-w-3xl font-[family-name:var(--font-display)] text-[clamp(36px,5vw,68px)] font-normal leading-[1.05] tracking-tight text-zinc-950"
          >
            Built on every planning record in England.
          </h2>
        </div>

        <div className="mt-20 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <StatBlock
              key={s.label}
              stat={s}
              hairlineClass={
                i === 0
                  ? "editorial-hairline sm:editorial-hairline"
                  : "editorial-hairline"
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
