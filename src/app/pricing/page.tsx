import type { Metadata } from "next";
import { loadPlans } from "@/lib/pricing";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScriptProps,
  productJsonLd,
  publicPageMetadata,
} from "@/lib/seo";
import { PricingContent } from "./pricing-content";

export const revalidate = 3600;

function starterPriceCopy(plans: Awaited<ReturnType<typeof loadPlans>>): string {
  const starter = plans.find((plan) => plan.id === "starter");
  const label = starter?.monthlyPriceLabel ?? starter?.priceLabel;
  return label ? `Start from ${label}/month` : "Start with a 3-day trial";
}

export async function generateMetadata(): Promise<Metadata> {
  const plans = await loadPlans();
  const trialCopy = starterPriceCopy(plans);
  return publicPageMetadata({
    title: "Pricing",
    description: `Simple, transparent pricing for Plott. ${trialCopy} with a 3-day trial. Annual billing saves two months. Cancel any time, VAT may apply.`,
    path: "/pricing",
    openGraphTitle: "Pricing — Plott",
    openGraphDescription: `Simple, transparent pricing. ${trialCopy} with a 3-day trial.`,
    twitterTitle: "Pricing — Plott",
    twitterDescription: `Simple, transparent pricing. ${trialCopy} with a 3-day trial.`,
  });
}

export default async function PricingPage() {
  const plans = await loadPlans();
  const pricingJsonLd = [
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Pricing", path: "/pricing" },
    ]),
    productJsonLd({
      name: "Plott",
      description:
        "Planning intelligence, applicant enrichment, saved searches and branded outreach for UK construction and property teams.",
      path: "/pricing",
      offers: plans
        .map((plan) => {
          const label = plan.monthlyPriceLabel ?? plan.priceLabel;
          if (!label) return null;
          return {
            price: label.replace(/[^0-9.]/g, ""),
            priceCurrency: plan.currency ?? "GBP",
          };
        })
        .filter((offer): offer is { price: string; priceCurrency: string } =>
          Boolean(offer?.price),
        ),
    }),
    faqJsonLd([
      {
        question: "How does the 3-day trial work?",
        answer:
          "Start any plan from the pricing grid, enter your card details in Stripe Checkout, and you will not be charged during the trial period. Cancel any time from the billing portal.",
      },
      {
        question: "Can I switch plans later?",
        answer:
          "Yes. Upgrades are prorated and take effect immediately. Downgrades take effect at the end of your current billing period.",
      },
      {
        question: "Where does your data come from?",
        answer:
          "Plott aggregates official UK government planning registers and commercial planning databases, covering all 337 local planning authorities with continuous refresh.",
      },
      {
        question: "Is this GDPR compliant?",
        answer:
          "Plott is a UK-registered company and uses lawful sources for planning-application data. Outreach generated through the platform is designed to support legitimate-interest B2B contact.",
      },
    ]),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(pricingJsonLd)}
      />
      <main className="flex-1 bg-white">
        <PricingContent plans={plans} />
      </main>
    </>
  );
}
