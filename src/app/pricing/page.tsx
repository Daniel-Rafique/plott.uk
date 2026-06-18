import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { loadPlans } from "@/lib/pricing";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScriptProps,
  productJsonLd,
  publicPageMetadata,
} from "@/lib/seo";
import { PricingContent } from "./pricing-content";

export const metadata: Metadata = publicPageMetadata({
  title: "Pricing",
  description:
    "Simple, transparent pricing for Plott. Start from £99/month with a 3-day trial. Cancel any time, VAT may apply.",
  path: "/pricing",
  openGraphTitle: "Pricing — Plott",
  openGraphDescription:
    "Simple, transparent pricing. Start from £99/month with a 3-day trial.",
  twitterTitle: "Pricing — Plott",
  twitterDescription:
    "Simple, transparent pricing. Start from £99/month with a 3-day trial.",
});

export const dynamic = "force-dynamic";

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
      offers: plans.map((plan) => ({
        price: (plan.priceLabel ?? "£99").replace(/[^0-9.]/g, ""),
        priceCurrency: plan.currency ?? "GBP",
      })),
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
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(pricingJsonLd)}
      />
      <main className="flex-1">
        <PricingContent plans={plans} />
      </main>
      <SiteFooter />
    </div>
  );
}
