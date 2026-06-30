import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getCompanyTier, tierDef, getStripeMeta } from "@/lib/ai/tiers";
import { loadPlans, getCompanyBillingInterval } from "@/lib/pricing";
import { repairSubscriptionStateForEntitlements } from "@/lib/stripe/subscription-repair";
import { BillingSettingsClient } from "./billing-settings-client";

export const dynamic = "force-dynamic";

export default async function BillingSettingsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  let company = await prisma.company.findUnique({
    where: { id: ctx.company.id },
    select: {
      id: true,
      stripeCustomerId: true,
      subscriptionStatus: true,
      subscriptionPriceId: true,
      subscriptionCurrentPeriodEnd: true,
      trialEndsAt: true,
      aiMonthlySpendGbp: true,
    },
  });
  if (company) {
    const repaired = await repairSubscriptionStateForEntitlements(company.id);
    if (repaired) company = { ...company, ...repaired };
  }

  const tier = company ? getCompanyTier(company) : "free";
  const tierInfo = tierDef(tier);
  const plans = await loadPlans();
  const currentPlan = plans.find((p) => p.id === tier) ?? null;

  const monthlyBudgetGbp = currentPlan?.aiBudgetGbp ?? tierInfo.monthlyBudgetCapGbp;
  const aiSpendGbp = Number(company?.aiMonthlySpendGbp ?? 0);

  const meta = await getStripeMeta(company?.subscriptionPriceId ?? null);
  const overageRate = meta.aiOverageRate ?? 4;
  const billingInterval = company
    ? getCompanyBillingInterval(company)
    : "month";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Manage your subscription, payment method, and invoices. Upgrades
          and downgrades are handled through Stripe&rsquo;s secure billing
          portal.
        </p>
      </header>

      <BillingSettingsClient
        initial={{
          tier: {
            id: tierInfo.id,
            label: tierInfo.label,
            monthlyBudgetCapGbp: monthlyBudgetGbp,
          },
          aiUsage: {
            spentGbp: aiSpendGbp,
            includedBudgetGbp: monthlyBudgetGbp,
            overageRate,
          },
          subscription: {
            status: company?.subscriptionStatus ?? "none",
            currentPeriodEnd:
              company?.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
            trialEndsAt: company?.trialEndsAt?.toISOString() ?? null,
            hasStripeCustomer: Boolean(company?.stripeCustomerId),
            billingInterval,
          },
          currentPlan: currentPlan
            ? {
                id: currentPlan.id,
                name: currentPlan.name,
                tagline: currentPlan.tagline,
                features: currentPlan.features,
                priceLabel: currentPlan.priceLabel ?? null,
                monthlyPriceLabel: currentPlan.monthlyPriceLabel ?? null,
                annualPriceLabel: currentPlan.annualPriceLabel ?? null,
                annualEffectiveMonthlyLabel:
                  currentPlan.annualEffectiveMonthlyLabel ?? null,
                interval: currentPlan.interval ?? null,
              }
            : null,
          plans: plans.map((p) => ({
            id: p.id,
            name: p.name,
            tagline: p.tagline,
            features: p.features,
            priceLabel: p.priceLabel ?? null,
            monthlyPriceLabel: p.monthlyPriceLabel ?? p.priceLabel ?? null,
            annualPriceLabel: p.annualPriceLabel ?? null,
            annualEffectiveMonthlyLabel: p.annualEffectiveMonthlyLabel ?? null,
            interval: p.interval ?? null,
            highlight: Boolean(p.highlight),
          })),
        }}
      />
    </div>
  );
}
