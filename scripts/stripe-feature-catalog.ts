/**
 * Stripe Entitlements feature catalog (Dashboard documentation only — not wired to app).
 * Maps monetizable capabilities to plan products for internal Stripe catalog clarity.
 */

import type { PlanId } from "./stripe-plan-catalog";

export type StripeFeatureDef = {
  lookupKey: string;
  name: string;
  /** Plans whose Stripe product should include this feature. */
  planIds: PlanId[];
};

export const STRIPE_FEATURE_CATALOG: StripeFeatureDef[] = [
  {
    lookupKey: "csv_export",
    name: "CSV export",
    planIds: ["starter", "pro", "agency"],
  },
  {
    lookupKey: "saved_searches",
    name: "Saved searches with email digests",
    planIds: ["pro", "agency"],
  },
  {
    lookupKey: "pinned_applications",
    name: "Pinned applications with change tracking",
    planIds: ["pro", "agency"],
  },
  {
    lookupKey: "auto_outreach",
    name: "Autonomous outreach pipeline",
    planIds: ["agency"],
  },
];
