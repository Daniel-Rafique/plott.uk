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
    productDescription: "Sole traders: NL search + digest summaries",
    amountPence: 4999,
    priceNickname: "Starter / monthly",
    metadata: { ...STARTER_META },
  },
  {
    envVar: "STRIPE_PRICE_STARTER_ANNUAL",
    planId: "starter",
    interval: "year",
    label: "Starter",
    productName: "Plott Starter",
    productDescription: "Sole traders: NL search + digest summaries",
    amountPence: 49990,
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
      "Growing contractors: Starter + letter assist + enrichment",
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
      "Growing contractors: Starter + letter assist + enrichment",
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
    productDescription: "Multi-office firms: Pro + autonomous outreach",
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
    productDescription: "Multi-office firms: Pro + autonomous outreach",
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
