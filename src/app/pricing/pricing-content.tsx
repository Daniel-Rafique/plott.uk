"use client";

import type { Plan } from "@/lib/pricing";
import { StackingSections } from "@/lib/animation/stacking-sections";
import { PricingHero, PricingFaqHeader } from "./pricing-hero";
import { PricingGrid } from "./pricing-grid";
import { PricingFaq } from "./pricing-faq";
import { EmailCapture } from "@/components/marketing/email-capture";

export function PricingContent({ plans }: { plans: Plan[] }) {
  return (
    <StackingSections>
      <PricingHero />
      <PricingGrid plans={plans} />

      <section
        data-stack
        data-bg="#fafaf9"
        className="relative bg-stone-50 py-24 md:py-32"
      >
        <div className="mx-auto w-full max-w-5xl px-6">
          <PricingFaqHeader />
          <PricingFaq />
          <div className="mt-16">
            <EmailCapture
              source="pricing_inline"
              leadMagnet="Outreach Letter Template"
              title="Get the outreach letter template"
              description="A practical starter template for turning planning applications into clear, privacy-aware outreach letters."
            />
          </div>
          <p className="mt-20 editorial-hairline pt-8 text-[13px] text-zinc-600">
            Need help with your planning application?{" "}
            <a
              className="text-zinc-950 underline underline-offset-2"
              href="/contact"
            >
              Get in touch
            </a>
            .
          </p>
        </div>
      </section>
    </StackingSections>
  );
}
