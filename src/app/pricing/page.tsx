import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { loadPlans } from "@/lib/pricing";
import { publicPageMetadata } from "@/lib/seo";
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

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <PricingContent plans={plans} />
      </main>
      <SiteFooter />
    </div>
  );
}
