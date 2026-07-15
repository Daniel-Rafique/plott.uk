/**
 * Single source of truth for Plott subscription list prices (docs/stripe-pricing.md).
 * Used by ensure-stripe-prices.ts, create-stripe-products.ts, and audit-stripe-pricing.ts.
 */

export type BillingInterval = "month" | "year";
export type PlanId = "starter" | "pro" | "agency";

export type PlanCatalogEntry = {
  envVar:
    | "STRIPE_PRICE_STARTER"
    | "STRIPE_PRICE_PRO"
    | "STRIPE_PRICE_AGENCY"
    | "STRIPE_PRICE_STARTER_ANNUAL"
    | "STRIPE_PRICE_PRO_ANNUAL"
    | "STRIPE_PRICE_AGENCY_ANNUAL";
  planId: PlanId;
  interval: BillingInterval;
  label: string;
  productName: string;
  productDescription: string;
  /** GBP minor units (pence) per billing period */
  amountPence: number;
  priceNickname: string;
  metadata: Record<string, string>;
};

/** Annual prices = 10× monthly (two months free). */
export const ANNUAL_MONTHS_PAID = 10;

/**
 * Stripe product tax code applied to every Plott subscription product.
 * `txcd_10103001` = Software as a Service (SaaS) - Business Use, which is
 * eligible for Managed Payments (Stripe as merchant of record). Every product
 * sold through a Managed Payments Checkout Session must carry an eligible code.
 */
export const MANAGED_PAYMENTS_TAX_CODE = "txcd_10103001";

const STARTER_META = {
  ai_monthly_budget_gbp: "10",
  saved_search_limit: "0",
  pinned_application_limit: "0",
  auto_outreach: "false",
  ai_overage_rate: "4",
} as const;

const PRO_META = {
  ai_monthly_budget_gbp: "25",
  saved_search_limit: "5",
  pinned_application_limit: "5",
  auto_outreach: "false",
  ai_overage_rate: "4",
} as const;

const AGENCY_META = {
  ai_monthly_budget_gbp: "75",
  saved_search_limit: "20",
  pinned_application_limit: "20",
  auto_outreach: "true",
  ai_overage_rate: "4",
} as const;

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    envVar: "STRIPE_PRICE_STARTER",
    planId: "starter",
    interval: "month",
    label: "Starter",
    productName: "Plott Starter",
    productDescription:
      "Plott Starter SaaS subscription for UK construction firms. Cloud software access for planning-application map search, natural-language search, planning Q&A, manual letter PDF export, and CSV export. Includes 1 user seat and monthly AI credit; AI overage is metered separately.",
    amountPence: 4900,
    priceNickname: "Starter / monthly",
    metadata: { ...STARTER_META },
  },
  {
    envVar: "STRIPE_PRICE_STARTER_ANNUAL",
    planId: "starter",
    interval: "year",
    label: "Starter",
    productName: "Plott Starter",
    productDescription:
      "Plott Starter SaaS subscription for UK construction firms. Cloud software access for planning-application map search, natural-language search, planning Q&A, manual letter PDF export, and CSV export. Includes 1 user seat and monthly AI credit; AI overage is metered separately.",
    amountPence: 49900,
    priceNickname: "Starter / annual (2 months free)",
    metadata: { ...STARTER_META },
  },
  {
    envVar: "STRIPE_PRICE_PRO",
    planId: "pro",
    interval: "month",
    label: "Pro",
    productName: "Plott Pro",
    productDescription:
      "Plott Pro SaaS subscription for UK construction firms. Cloud software access for unlimited map search, saved searches with email digests, pinned application tracking, branded letter and email outreach, AI drafting, applicant enrichment, and property ownership lookup. Includes 5 team seats; additional licensed seats and AI overage are billed separately.",
    amountPence: 9900,
    priceNickname: "Pro / monthly",
    metadata: { ...PRO_META },
  },
  {
    envVar: "STRIPE_PRICE_PRO_ANNUAL",
    planId: "pro",
    interval: "year",
    label: "Pro",
    productName: "Plott Pro",
    productDescription:
      "Plott Pro SaaS subscription for UK construction firms. Cloud software access for unlimited map search, saved searches with email digests, pinned application tracking, branded letter and email outreach, AI drafting, applicant enrichment, and property ownership lookup. Includes 5 team seats; additional licensed seats and AI overage are billed separately.",
    amountPence: 99000,
    priceNickname: "Pro / annual (2 months free)",
    metadata: { ...PRO_META },
  },
  {
    envVar: "STRIPE_PRICE_AGENCY",
    planId: "agency",
    interval: "month",
    label: "Agency",
    productName: "Plott Agency",
    productDescription:
      "Plott Agency SaaS subscription for multi-office firms and lead-generation agencies. Cloud software access including everything in Pro plus autonomous outreach pipeline and bulk letter generation. Includes 10 team seats; additional licensed seats and AI overage are billed separately.",
    amountPence: 19900,
    priceNickname: "Agency / monthly",
    metadata: { ...AGENCY_META },
  },
  {
    envVar: "STRIPE_PRICE_AGENCY_ANNUAL",
    planId: "agency",
    interval: "year",
    label: "Agency",
    productName: "Plott Agency",
    productDescription:
      "Plott Agency SaaS subscription for multi-office firms and lead-generation agencies. Cloud software access including everything in Pro plus autonomous outreach pipeline and bulk letter generation. Includes 10 team seats; additional licensed seats and AI overage are billed separately.",
    amountPence: 199000,
    priceNickname: "Agency / annual (2 months free)",
    metadata: { ...AGENCY_META },
  },
];

export function catalogByPlanId(planId: PlanId): PlanCatalogEntry[] {
  return PLAN_CATALOG.filter((e) => e.planId === planId);
}

export function catalogEntryForEnv(
  envVar: string,
): PlanCatalogEntry | undefined {
  return PLAN_CATALOG.find((e) => e.envVar === envVar);
}
