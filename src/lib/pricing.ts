import { cache } from "react";
import type Stripe from "stripe";
import { defaultMonthlyBudgetCapGbp } from "@/lib/ai/tiers";
import {
  billingIntervalForPriceId,
  planForPriceId,
  type BillingInterval,
} from "@/lib/stripe/plan-prices";
import {
  annualEffectiveMonthlyLabel,
  fetchStripePricesById,
  formatPriceMinor,
  formatStripePriceAmount,
  priceMinorUnits,
} from "@/lib/stripe/price-display";
import { resolveExtraSeatPriceId } from "@/lib/stripe/seat-prices";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";

export type { BillingInterval };

export type Plan = {
  id: "starter" | "pro" | "agency";
  /** Monthly licensed Stripe price id (checkout default). */
  priceId: string | null;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
  name: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
  /** Primary display price (monthly). */
  priceLabel?: string;
  monthlyPriceLabel?: string;
  annualPriceLabel?: string;
  /** e.g. "~£42/mo" when paying annually */
  annualEffectiveMonthlyLabel?: string;
  interval?: string;
  currency?: string;
  seatLimit: number;
  extraSeatPrice: number | null;
  extraSeatPriceLabel?: string;
  savedSearchLimit: number;
  pinnedApplicationLimit: number;
  /** From Stripe price metadata `auto_outreach`; falls back to Agency tier. */
  autoOutreach?: boolean;
  aiBudgetGbp: number;
};

type PlanDef = Omit<Plan, "features">;

const PLAN_DEFINITIONS: PlanDef[] = [
  {
    id: "starter",
    priceId: null,
    monthlyPriceId: null,
    annualPriceId: null,
    name: "Starter",
    tagline: "For sole traders and small teams getting started.",
    seatLimit: 1,
    extraSeatPrice: null,
    savedSearchLimit: 0,
    pinnedApplicationLimit: 0,
    aiBudgetGbp: defaultMonthlyBudgetCapGbp("starter"),
  },
  {
    id: "pro",
    priceId: null,
    monthlyPriceId: null,
    annualPriceId: null,
    name: "Pro",
    tagline: "For growing contractors who need an edge.",
    highlight: true,
    seatLimit: 3,
    extraSeatPrice: 2500,
    extraSeatPriceLabel: "£25/seat",
    savedSearchLimit: 5,
    pinnedApplicationLimit: 5,
    aiBudgetGbp: defaultMonthlyBudgetCapGbp("pro"),
  },
  {
    id: "agency",
    priceId: null,
    monthlyPriceId: null,
    annualPriceId: null,
    name: "Agency",
    tagline: "For multi-office firms and lead generation agencies.",
    seatLimit: 10,
    extraSeatPrice: 2000,
    extraSeatPriceLabel: "£20/seat",
    savedSearchLimit: 20,
    pinnedApplicationLimit: 20,
    aiBudgetGbp: defaultMonthlyBudgetCapGbp("agency"),
  },
];

function planDefWithEnvIds(def: PlanDef): PlanDef {
  const monthly =
    process.env[`STRIPE_PRICE_${def.id.toUpperCase()}` as keyof NodeJS.ProcessEnv] ??
    null;
  const annual =
    process.env[
      `STRIPE_PRICE_${def.id.toUpperCase()}_ANNUAL` as keyof NodeJS.ProcessEnv
    ] ?? null;
  return {
    ...def,
    monthlyPriceId: monthly,
    annualPriceId: annual,
    priceId: monthly,
  };
}

function extraSeatFeatureLine(plan: Plan): string | null {
  if (plan.extraSeatPrice == null) return null;
  const n = plan.extraSeatPrice / 100;
  const gbp = n % 1 === 0 ? String(n) : n.toFixed(2);
  return `Additional seats £${gbp}/month each`;
}

function savedSearchFeatureLine(plan: Plan): string | null {
  if (plan.savedSearchLimit <= 0) return null;
  const n = plan.savedSearchLimit;
  return `${n} saved search${n === 1 ? "" : "es"} with email digests`;
}

function pinnedApplicationFeatureLine(plan: Plan): string | null {
  if (plan.pinnedApplicationLimit <= 0) return null;
  const n = plan.pinnedApplicationLimit;
  return `${n} pinned application${n === 1 ? "" : "s"} with change tracking`;
}

function aiBudgetLine(plan: Plan): string {
  if (plan.aiBudgetGbp <= 0) {
    return "No included monthly AI credit on this plan.";
  }
  return `£${plan.aiBudgetGbp}/month included AI credit. Overage is metered and billed on your next invoice; optional daily cap in Settings → AI.`;
}

export function buildPlanFeatures(plan: Plan): string[] {
  if (plan.id === "starter") {
    return [
      "1 user seat",
      "25 map searches per day",
      "Photorealistic 3D map view",
      "CSV export of results",
      "Manual letter creation + PDF export",
      "AI natural-language search",
      "Planning Q&A chat assistant",
      "Saved searches and pinned application tracking are available on Pro.",
      aiBudgetLine(plan),
    ];
  }
  if (plan.id === "pro") {
    const extra = extraSeatFeatureLine(plan);
    const saved = savedSearchFeatureLine(plan);
    const pinned = pinnedApplicationFeatureLine(plan);
    return [
      "3 team seats included",
      ...(extra ? [extra] : []),
      "Unlimited map searches",
      "Everything in Starter, plus:",
      ...(saved ? [saved] : []),
      ...(pinned ? [pinned] : []),
      "Branded letter + email outreach with e-signature",
      "AI drafting for letters and emails + applicant research",
      "Smart enrichment (applicant & agent details)",
      "Property ownership lookup",
      aiBudgetLine(plan),
    ];
  }
  const extra = extraSeatFeatureLine(plan);
  const saved = savedSearchFeatureLine(plan);
  const pinned = pinnedApplicationFeatureLine(plan);
  return [
    `${plan.seatLimit} team seats included`,
    ...(extra ? [extra] : []),
    "Unlimited map searches",
    "Everything in Pro, plus:",
    ...(saved ? [saved] : []),
    ...(pinned ? [pinned] : []),
    "Autonomous outreach pipeline",
    "AI-drafted letters and emails with human approval inbox",
    "Bulk letter generation (ZIP download)",
    "Priority LPA portal enrichment",
    "ICP-based lead filtering",
    "Dedicated onboarding + phone support",
    aiBudgetLine(plan),
  ];
}

function toPlan(def: PlanDef): Plan {
  return { ...def, features: buildPlanFeatures(def as Plan) };
}

function stripePriceMetadata(price: Stripe.Price): Record<string, string> {
  return {
    ...(typeof price.product === "object" &&
    price.product &&
    "metadata" in price.product
      ? price.product.metadata
      : {}),
    ...price.metadata,
  };
}

function applyMetadata(
  def: PlanDef,
  meta: Record<string, string>,
): PlanDef {
  let next = def;
  if (meta.ai_monthly_budget_gbp) {
    const n = Number(meta.ai_monthly_budget_gbp);
    if (!Number.isNaN(n) && n >= 0) next = { ...next, aiBudgetGbp: n };
  }
  if (meta.saved_search_limit) {
    const n = Number(meta.saved_search_limit);
    if (!Number.isNaN(n) && n >= 0) next = { ...next, savedSearchLimit: n };
  }
  if (meta.pinned_application_limit) {
    const n = Number(meta.pinned_application_limit);
    if (!Number.isNaN(n) && n >= 0) {
      next = { ...next, pinnedApplicationLimit: n };
    }
  }
  if (meta.auto_outreach === "true") {
    next = { ...next, autoOutreach: true };
  } else if (meta.auto_outreach === "false") {
    next = { ...next, autoOutreach: false };
  }
  return next;
}

function mergeDefsFromStripe(
  defs: PlanDef[],
  byId: Map<string, Stripe.Price>,
): PlanDef[] {
  return defs.map((def) => {
    let next = { ...def };
    const monthly = def.monthlyPriceId ? byId.get(def.monthlyPriceId) : null;
    const annual = def.annualPriceId ? byId.get(def.annualPriceId) : null;

    if (monthly) {
      const formatted = formatStripePriceAmount(monthly);
      if (formatted) {
        next = applyMetadata(
          {
            ...next,
            priceLabel: formatted.priceLabel,
            monthlyPriceLabel: formatted.priceLabel,
            interval: formatted.interval ?? "month",
            currency: formatted.currency,
          },
          stripePriceMetadata(monthly),
        );
      }
    }
    if (annual) {
      const formatted = formatStripePriceAmount(annual);
      if (formatted) {
        next = {
          ...next,
          annualPriceLabel: formatted.priceLabel,
          annualEffectiveMonthlyLabel:
            annualEffectiveMonthlyLabel(annual) ?? undefined,
        };
      }
    }
    if (def.id === "pro" || def.id === "agency") {
      const seatPriceId = resolveExtraSeatPriceId(def.id, "month");
      const seatPrice = seatPriceId ? byId.get(seatPriceId) : null;
      if (seatPrice) {
        const minor = priceMinorUnits(seatPrice);
        if (minor != null && seatPrice.currency) {
          const label = formatPriceMinor(minor, seatPrice.currency);
          next = {
            ...next,
            extraSeatPrice: minor,
            extraSeatPriceLabel: `${label}/seat`,
          };
        }
      }
    }
    return next;
  });
}

export const loadPlans = cache(async function loadPlans(): Promise<Plan[]> {
  const defs = PLAN_DEFINITIONS.map(planDefWithEnvIds);
  const priceIds = [
    ...defs.map((p) => p.monthlyPriceId),
    ...defs.map((p) => p.annualPriceId),
    ...defs.flatMap((p) =>
      p.id === "pro" || p.id === "agency"
        ? [
            resolveExtraSeatPriceId(p.id, "month"),
            resolveExtraSeatPriceId(p.id, "year"),
          ]
        : [],
    ),
  ].filter(Boolean) as string[];

  if (!priceIds.length) {
    return defs.map((d) => toPlan(d));
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn(
      "STRIPE_SECRET_KEY not set — plan prices are unavailable until Stripe is configured.",
    );
    return defs.map((d) => toPlan(d));
  }

  try {
    const byId = await fetchStripePricesById(priceIds);
    const merged = mergeDefsFromStripe(defs, byId);
    return merged.map((d) => toPlan(d));
  } catch (e) {
    console.error("Pricing fetch failed:", e);
    return defs.map((d) => toPlan(d));
  }
});

export const FREE_PLAN: Plan = {
  id: "starter",
  priceId: null,
  monthlyPriceId: null,
  annualPriceId: null,
  name: "Free",
  tagline: "Try Plott with limited features.",
  priceLabel: "£0",
  interval: "month",
  currency: "GBP",
  seatLimit: 1,
  extraSeatPrice: null,
  savedSearchLimit: 0,
  pinnedApplicationLimit: 0,
  aiBudgetGbp: 0,
  features: [
    "1 user seat",
    "5 map searches per day",
    "2D map view only",
    "Limited AI features",
  ],
};

export function getPlanById(id: string | null | undefined): Plan {
  if (!id) return FREE_PLAN;
  const def = PLAN_DEFINITIONS.find((p) => p.id === id);
  return def ? toPlan(planDefWithEnvIds(def)) : FREE_PLAN;
}

export function getPlanByPriceId(priceId: string | null | undefined): Plan {
  const planId = planForPriceId(priceId ?? undefined);
  return planId ? getPlanById(planId) : FREE_PLAN;
}

export function getCompanyPlan(company: {
  subscriptionStatus: string;
  subscriptionPriceId: string | null;
  subscriptionCurrentPeriodEnd?: Date | string | null;
  trialEndsAt?: Date | string | null;
}): Plan {
  if (!hasSubscriptionAccess(company)) {
    return FREE_PLAN;
  }
  return getPlanByPriceId(company.subscriptionPriceId);
}

export function getCompanyBillingInterval(company: {
  subscriptionPriceId: string | null;
}): BillingInterval {
  return billingIntervalForPriceId(company.subscriptionPriceId ?? undefined) ?? "month";
}

export function getSavedSearchLimit(company: {
  subscriptionStatus: string;
  subscriptionPriceId: string | null;
  subscriptionCurrentPeriodEnd?: Date | string | null;
  trialEndsAt?: Date | string | null;
}): number {
  const plan = getCompanyPlan(company);
  return plan.savedSearchLimit;
}
