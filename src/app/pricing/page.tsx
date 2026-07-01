import type { Metadata } from "next";
import { loadPlans } from "@/lib/pricing";
import {
  faqDataSources,
  faqGdpr,
  faqTrialWorks,
  pricingMetadataTrialPhrase,
  PRODUCT_DESCRIPTION,
} from "@/lib/marketing/copy";
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
  return label ? `Start from ${label}/month` : `Start with a ${pricingMetadataTrialPhrase()}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const plans = await loadPlans();
  const trialCopy = starterPriceCopy(plans);
  const trialPhrase = pricingMetadataTrialPhrase();
  return publicPageMetadata({
    title: "Pricing",
    description: `Simple, transparent pricing for Plott. ${trialCopy} with a ${trialPhrase}. Annual billing saves two months. Cancel any time, VAT may apply.`,
    path: "/pricing",
    openGraphTitle: "Pricing — Plott",
    openGraphDescription: `Simple, transparent pricing. ${trialCopy} with a ${trialPhrase}.`,
    twitterTitle: "Pricing — Plott",
    twitterDescription: `Simple, transparent pricing. ${trialCopy} with a ${trialPhrase}.`,
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
        PRODUCT_DESCRIPTION,
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
      faqTrialWorks(),
      {
        question: "Can I switch plans later?",
        answer:
          "Yes. Upgrades are prorated and take effect immediately. Downgrades take effect at the end of your current billing period.",
      },
      {
        question: "Where does your data come from?",
        answer: faqDataSources(),
      },
      {
        question: "Is this GDPR compliant?",
        answer: faqGdpr(),
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
