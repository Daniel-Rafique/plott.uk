"use client";

import { useTextReveal } from "@/lib/animation/use-text-reveal";
import { useGsapReveal } from "@/lib/animation/use-gsap-reveal";

export function PricingHero() {
  const headingRef = useTextReveal<HTMLHeadingElement>();
  const wrapRef = useGsapReveal<HTMLDivElement>({ stagger: 0.06 });

  return (
    <section
      data-stack
      data-bg="#ffffff"
      className="relative bg-white pt-20 pb-24 md:pt-28 md:pb-32"
    >
      <div className="mx-auto w-full max-w-7xl px-6">
        <div ref={wrapRef} className="editorial-hairline max-w-3xl pt-10">
          <p
            data-reveal
            className="editorial-chapter-label text-brand-dark"
          >
            Pricing
          </p>
          <h1
            ref={headingRef}
            className="mt-6 font-[family-name:var(--font-display)] text-[clamp(40px,6vw,88px)] font-normal leading-[1.05] tracking-tight text-zinc-950"
          >
            One workspace. Three ways in.
          </h1>
          <p
            data-reveal
            className="mt-6 max-w-xl text-[15px] leading-relaxed text-zinc-600"
          >
            Start with a 3-day trial on any plan. Cancel from the
            billing portal any time. VAT added automatically where applicable.
          </p>
        </div>
      </div>
    </section>
  );
}

export function PricingFaqHeader() {
  const headingRef = useTextReveal<HTMLHeadingElement>();
  const wrapRef = useGsapReveal<HTMLDivElement>({ stagger: 0.06 });

  return (
    <div ref={wrapRef} className="editorial-hairline max-w-3xl pt-10">
      <p
        data-reveal
        className="editorial-chapter-label text-brand-dark"
      >
        Frequently asked
      </p>
      <h2
        ref={headingRef}
        className="mt-6 font-[family-name:var(--font-display)] text-[clamp(32px,4.5vw,60px)] font-normal leading-[1.1] tracking-tight text-zinc-950"
      >
        Questions we hear most often.
      </h2>
    </div>
  );
}
