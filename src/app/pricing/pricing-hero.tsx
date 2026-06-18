"use client";

import { AnimatedMarketingHero } from "@/components/marketing/animated-marketing-hero";
import { useTextReveal } from "@/lib/animation/use-text-reveal";
import { useGsapReveal } from "@/lib/animation/use-gsap-reveal";
import { PRICING_HERO } from "@/lib/marketing/images";

export function PricingHero() {
  return (
    <AnimatedMarketingHero
      eyebrow="Pricing"
      title="One workspace."
      accent="Three ways in."
      description="Start with a 3-day trial on any plan. Cancel from the billing portal any time. VAT added automatically where applicable."
      image={PRICING_HERO}
    />
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
