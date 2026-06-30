import { getStripe } from "@/lib/stripe";
import { defaultMonthlyBudgetCapGbp } from "@/lib/ai/tiers";
import {
  billingIntervalForPriceId,
  planForPriceId,
  type BillingInterval,
} from "@/lib/stripe/plan-prices";
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
    priceLabel: "£49.99",
    monthlyPriceLabel: "£49.99",
    annualPriceLabel: "£499.90",
    annualEffectiveMonthlyLabel: "~£41.66/mo",
    interval: "month",
    currency: "GBP",
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
    priceLabel: "£99",
    monthlyPriceLabel: "£99",
    annualPriceLabel: "£990",
    annualEffectiveMonthlyLabel: "~£82.50/mo",
    interval: "month",
    currency: "GBP",
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
    priceLabel: "£199",
    monthlyPriceLabel: "£199",
    annualPriceLabel: "£1,990",
    annualEffectiveMonthlyLabel: "~£165.83/mo",
    interval: "month",
    currency: "GBP",
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
      "Branded PDF letters with e-signature",
      "AI letter assist + applicant research",
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
    "AI-drafted letters with human approval inbox",
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

function formatPriceMinor(minor: number, currency: string): string {
  const n = minor / 100;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

function formatStripePrice(p: import("stripe").Stripe.Price): {
  priceLabel?: string;
  interval?: string;
  currency?: string;
} {
  if (!p.currency) return {};
  const minor =
    p.unit_amount != null
      ? p.unit_amount
      : p.unit_amount_decimal != null
        ? Math.round(parseFloat(String(p.unit_amount_decimal)))
        : null;
  if (minor == null) return {};
  return {
    priceLabel: formatPriceMinor(minor, p.currency),
    currency: p.currency.toUpperCase(),
    interval: p.recurring?.interval ?? undefined,
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
  return next;
}

function mergeDefsFromStripe(
  defs: PlanDef[],
  byId: Map<string, import("stripe").Stripe.Price>,
): PlanDef[] {
  return defs.map((def) => {
    let next = { ...def };
    const monthly = def.monthlyPriceId ? byId.get(def.monthlyPriceId) : null;
    const annual = def.annualPriceId ? byId.get(def.annualPriceId) : null;

    if (monthly) {
      const formatted = formatStripePrice(monthly);
      const meta = {
        ...(typeof monthly.product === "object" &&
        monthly.product &&
        "metadata" in monthly.product
          ? monthly.product.metadata
          : {}),
        ...monthly.metadata,
      };
      next = applyMetadata(
        {
          ...next,
          ...formatted,
          monthlyPriceLabel: formatted.priceLabel,
          priceLabel: formatted.priceLabel ?? next.priceLabel,
        },
        meta,
      );
    }
    if (annual) {
      const formatted = formatStripePrice(annual);
      const annualMinor = annual.unit_amount ?? 0;
      const effective = annualMinor > 0 ? annualMinor / 12 / 100 : 0;
      const effectiveLabel =
        effective > 0
          ? `~${new Intl.NumberFormat("en-GB", {
              style: "currency",
              currency: (annual.currency ?? "gbp").toUpperCase(),
              maximumFractionDigits: effective % 1 === 0 ? 0 : 2,
            }).format(effective)}/mo`
          : next.annualEffectiveMonthlyLabel;
      next = {
        ...next,
        annualPriceLabel: formatted.priceLabel ?? next.annualPriceLabel,
        annualEffectiveMonthlyLabel: effectiveLabel,
      };
    }
    return next;
  });
}

export async function loadPlans(): Promise<Plan[]> {
  const defs = PLAN_DEFINITIONS.map(planDefWithEnvIds);
  const priceIds = [
    ...defs.map((p) => p.monthlyPriceId),
    ...defs.map((p) => p.annualPriceId),
  ].filter(Boolean) as string[];

  if (!priceIds.length) {
    return defs.map((d) => toPlan(d));
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn(
      "STRIPE_SECRET_KEY not set — pricing page and billing use static plan defaults.",
    );
    return defs.map((d) => toPlan(d));
  }

  try {
    const stripe = getStripe();
    const prices = await Promise.all(
      priceIds.map((id) =>
        stripe.prices.retrieve(id, { expand: ["product"] }).catch(() => null),
      ),
    );
    const byId = new Map(prices.filter((p) => p).map((p) => [p!.id, p!]));
    const merged = mergeDefsFromStripe(defs, byId);
    return merged.map((d) => toPlan(d));
  } catch (e) {
    console.error("Pricing fetch failed:", e);
    return defs.map((d) => toPlan(d));
  }
}

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
