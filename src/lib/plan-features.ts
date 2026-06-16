import { getCompanyPlan, type Plan } from "@/lib/pricing";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";

export type PlanFeatures = {
  planId: Plan["id"];
  planName: string;
  canSaveSearches: boolean;
  canPinApplications: boolean;
  canUseAutoOutreach: boolean;
  canExportCsv: boolean;
  savedSearchLimit: number;
  pinnedApplicationLimit: number;
  upgradeHref: string;
};

type CompanyPlanInput = {
  subscriptionStatus: string;
  subscriptionPriceId: string | null;
  subscriptionCurrentPeriodEnd?: Date | string | null;
  trialEndsAt?: Date | string | null;
};

export function featuresForPlan(
  plan: Plan,
  opts: { canExportCsv?: boolean } = {},
): PlanFeatures {
  const savedSearchLimit = plan.savedSearchLimit;
  const pinnedApplicationLimit = plan.pinnedApplicationLimit;

  return {
    planId: plan.id,
    planName: plan.name,
    canSaveSearches: savedSearchLimit > 0,
    canPinApplications: pinnedApplicationLimit > 0,
    canUseAutoOutreach: plan.id === "agency" && plan.name !== "Free",
    canExportCsv: opts.canExportCsv ?? false,
    savedSearchLimit,
    pinnedApplicationLimit,
    upgradeHref: "/app/settings/billing",
  };
}

export function getCompanyPlanFeatures(company: CompanyPlanInput): PlanFeatures {
  return featuresForPlan(getCompanyPlan(company), {
    // Stripe trialing still has full plan entitlements elsewhere, but CSV export
    // stays off until the subscription is active (first charge / non-trial).
    canExportCsv:
      hasSubscriptionAccess(company) &&
      company.subscriptionStatus !== "trialing",
  });
}
