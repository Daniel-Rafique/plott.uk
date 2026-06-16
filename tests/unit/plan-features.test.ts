import { describe, expect, it } from "vitest";
import { featuresForPlan, getCompanyPlanFeatures } from "@/lib/plan-features";
import { getPlanById } from "@/lib/pricing";

describe("plan feature gates", () => {
  it("keeps Starter focused on search without saved-search or pin tracking", () => {
    const features = featuresForPlan(getPlanById("starter"));

    expect(features.canSaveSearches).toBe(false);
    expect(features.canPinApplications).toBe(false);
    expect(features.canUseAutoOutreach).toBe(false);
    expect(features.canExportCsv).toBe(false);
    expect(features.savedSearchLimit).toBe(0);
    expect(features.pinnedApplicationLimit).toBe(0);
  });

  it("unlocks saved searches and pinned applications on Pro", () => {
    const features = featuresForPlan(getPlanById("pro"));

    expect(features.canSaveSearches).toBe(true);
    expect(features.canPinApplications).toBe(true);
    expect(features.canUseAutoOutreach).toBe(false);
    expect(features.canExportCsv).toBe(false);
    expect(features.savedSearchLimit).toBe(5);
    expect(features.pinnedApplicationLimit).toBe(5);
  });

  it("reserves autonomous outreach for Agency", () => {
    const features = featuresForPlan(getPlanById("agency"));

    expect(features.canSaveSearches).toBe(true);
    expect(features.canPinApplications).toBe(true);
    expect(features.canUseAutoOutreach).toBe(true);
    expect(features.canExportCsv).toBe(false);
    expect(features.savedSearchLimit).toBe(20);
    expect(features.pinnedApplicationLimit).toBe(20);
  });

  it("hides CSV export while the subscription is trialing", () => {
    const features = getCompanyPlanFeatures({
      subscriptionStatus: "trialing",
      subscriptionPriceId: null,
    });

    expect(features.canExportCsv).toBe(false);
  });

  it("shows CSV export once the subscription is active", () => {
    const features = getCompanyPlanFeatures({
      subscriptionStatus: "active",
      subscriptionPriceId: null,
    });

    expect(features.canExportCsv).toBe(true);
  });
});
