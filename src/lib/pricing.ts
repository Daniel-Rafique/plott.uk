import { getStripe } from "@/lib/stripe";
import { defaultMonthlyBudgetCapGbp } from "@/lib/ai/tiers";
import { planForPriceId } from "@/lib/stripe/plan-prices";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";

export type Plan = {
  id: "starter" | "pro" | "agency";
  priceId: string | null;
  name: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
  /** Human-readable price string e.g. "£49". Null if Stripe is unconfigured. */
  priceLabel?: string;
  interval?: string;
  currency?: string;
  /** Number of seats included in the base price. */
  seatLimit: number;
  /** Price in pence for each additional seat beyond seatLimit. Null = no overages allowed (must upgrade). */
  extraSeatPrice: number | null;
  /** Human-readable extra seat price string e.g. "£25/seat". */
  extraSeatPriceLabel?: string;
  /** Maximum number of saved searches allowed. 0 = feature not available. */
  savedSearchLimit: number;
  /** Maximum number of pinned applications allowed. 0 = feature not available. */
  pinnedApplicationLimit: number;
  /** AI monthly budget in GBP. Merged from Stripe Price and Product metadata. */
  aiBudgetGbp: number;
};

type PlanDef = Omit<Plan, "features">;

/**
 * Local defaults. `loadPlans()` overwrites `priceLabel`, `aiBudgetGbp`, and
 * `savedSearchLimit` from each Stripe Price (and product metadata) when
 * `STRIPE_SECRET_KEY` and `STRIPE_PRICE_*` are set.
 */
const PLAN_DEFINITIONS: PlanDef[] = [
  {
    id: "starter",
    priceId: null,
    name: "Starter",
    tagline: "For sole traders and small teams getting started.",
    /** Display fallback only. With Stripe configured, `loadPlans()` overwrites from Price.unit_amount. */
    priceLabel: "£99",
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
    name: "Pro",
    tagline: "For growing contractors who need an edge.",
    highlight: true,
    priceLabel: "£199",
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
    name: "Agency",
    tagline: "For multi-office firms and lead generation agencies.",
    priceLabel: "£299",
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

function planDefWithEnvId(def: PlanDef): PlanDef {
  const key = `STRIPE_PRICE_${def.id.toUpperCase()}` as const;
  const priceId = process.env[key] ?? null;
  return { ...def, priceId };
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

/**
 * Public pricing / checkout feature list. Always reflects `savedSearchLimit`,
 * `aiBudgetGbp`, and seat / extra‑seat data on the `Plan` object.
 */
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

/**
 * Formats a Stripe Price for the UI. Uses `unit_amount` (or `unit_amount_decimal`
 * as fallback) from the API — that is the billing amount for the price ID.
 */
function formatPrice(p: import("stripe").Stripe.Price): {
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
  const n = minor / 100;
  const fmt = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: p.currency.toUpperCase(),
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  });
  return {
    priceLabel: fmt.format(n),
    currency: p.currency.toUpperCase(),
    interval: p.recurring?.interval ?? undefined,
  };
}

function mergeDefsFromStripe(
  defs: PlanDef[],
  byId: Map<string, import("stripe").Stripe.Price>,
): PlanDef[] {
  return defs.map((def) => {
    if (!def.priceId) return def;
    const price = byId.get(def.priceId);
    if (!price) return def;
    const meta = {
      ...(typeof price.product === "object" && price.product && "metadata" in price.product
        ? price.product.metadata
        : {}),
      ...price.metadata,
    };
    const formatted = formatPrice(price);
    if (!formatted.priceLabel) {
      console.warn(
        `Stripe price ${def.priceId} has no unit amount; keeping fallback label for ${def.id}.`,
      );
    }
    let next: PlanDef = { ...def, ...formatted };
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
  });
}

export async function loadPlans(): Promise<Plan[]> {
  const defs = PLAN_DEFINITIONS.map(planDefWithEnvId);
  const anyConfigured = defs.some((p) => p.priceId);
  if (!anyConfigured) {
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
    const priceIds = defs.map((p) => p.priceId).filter(Boolean) as string[];
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

/**
 * Free tier defaults for users without a paid subscription.
 * Allows 1 seat with no overage option — must upgrade to add team members.
 */
export const FREE_PLAN: Plan = {
  id: "starter",
  priceId: null,
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

/**
 * Get a plan by its ID (starter, pro, agency). Returns FREE_PLAN if not found.
 * Uses static definition (no live Stripe read); for billing UI, prefer `loadPlans()`.
 */
export function getPlanById(id: string | null | undefined): Plan {
  if (!id) return FREE_PLAN;
  const def = PLAN_DEFINITIONS.find((p) => p.id === id);
  return def ? toPlan(planDefWithEnvId(def)) : FREE_PLAN;
}

/**
 * Get a plan by its Stripe price ID. Returns FREE_PLAN if not found.
 * Uses static definition (no live Stripe read).
 */
export function getPlanByPriceId(priceId: string | null | undefined): Plan {
  const planId = planForPriceId(priceId ?? undefined);
  return planId ? getPlanById(planId) : FREE_PLAN;
}

/**
 * Determine the effective plan for a company based on subscription status.
 */
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

/**
 * Get the saved search limit for a company based on its plan.
 */
export function getSavedSearchLimit(company: {
  subscriptionStatus: string;
  subscriptionPriceId: string | null;
  subscriptionCurrentPeriodEnd?: Date | string | null;
  trialEndsAt?: Date | string | null;
}): number {
  const plan = getCompanyPlan(company);
  return plan.savedSearchLimit;
}
