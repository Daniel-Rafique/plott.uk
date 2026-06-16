/**
 * Single source of truth for Plott subscription list prices (docs/stripe-pricing.md).
 * Used by ensure-stripe-prices.ts and create-stripe-products.ts.
 */

export type PlanCatalogEntry = {
  envVar: "STRIPE_PRICE_STARTER" | "STRIPE_PRICE_PRO" | "STRIPE_PRICE_AGENCY";
  label: string;
  productName: string;
  productDescription: string;
  /** GBP minor units (pence) per month */
  amountPence: number;
  priceNickname: string;
  metadata: Record<string, string>;
};

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    envVar: "STRIPE_PRICE_STARTER",
    label: "Starter",
    productName: "Plott Starter",
    productDescription: "Sole traders: NL search + digest summaries",
    amountPence: 2900,
    priceNickname: "Starter / monthly",
    metadata: {
      ai_monthly_budget_gbp: "10",
      saved_search_limit: "0",
      pinned_application_limit: "0",
      auto_outreach: "false",
      ai_overage_rate: "2",
    },
  },
  {
    envVar: "STRIPE_PRICE_PRO",
    label: "Pro",
    productName: "Plott Pro",
    productDescription:
      "Growing contractors: Starter + letter assist + enrichment",
    amountPence: 7900,
    priceNickname: "Pro / monthly",
    metadata: {
      ai_monthly_budget_gbp: "25",
      saved_search_limit: "5",
      pinned_application_limit: "5",
      auto_outreach: "false",
      ai_overage_rate: "2",
    },
  },
  {
    envVar: "STRIPE_PRICE_AGENCY",
    label: "Agency",
    productName: "Plott Agency",
    productDescription:
      "Multi-office firms: Pro + autonomous outreach",
    amountPence: 19900,
    priceNickname: "Agency / monthly",
    metadata: {
      ai_monthly_budget_gbp: "100",
      saved_search_limit: "20",
      pinned_application_limit: "20",
      auto_outreach: "true",
      ai_overage_rate: "2",
    },
  },
];
