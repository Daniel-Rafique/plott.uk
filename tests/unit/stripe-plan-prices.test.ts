import { afterEach, describe, expect, it } from "vitest";
import {
  billingIntervalForPriceId,
  normalizePlan,
  paidPlanNextPath,
  planForPriceId,
  resolvePriceId,
  resolvePlanPriceId,
} from "@/lib/stripe/plan-prices";
import { getCompanyTier } from "@/lib/ai/tiers";
import { getPlanByPriceId } from "@/lib/pricing";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Stripe plan price helpers", () => {
  it("normalizes supported plan ids", () => {
    expect(normalizePlan(" Pro ")).toBe("pro");
    expect(normalizePlan("enterprise")).toBeNull();
    expect(normalizePlan(undefined)).toBeNull();
  });

  it("resolves explicit plan prices without falling back to another tier", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro";
    delete process.env.STRIPE_PRICE_AGENCY;
    delete process.env.STRIPE_PRICE_PRO_ANNUAL;

    expect(resolvePlanPriceId("pro")).toEqual({
      priceId: "price_pro",
      usedEnv: "STRIPE_PRICE_PRO",
    });
    expect(resolvePlanPriceId("agency")).toEqual({
      priceId: null,
      usedEnv: "STRIPE_PRICE_AGENCY",
    });
  });

  it("resolves annual plan prices when configured", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro_month";
    process.env.STRIPE_PRICE_PRO_ANNUAL = "price_pro_year";

    expect(resolvePlanPriceId("pro", "year")).toEqual({
      priceId: "price_pro_year",
      usedEnv: "STRIPE_PRICE_PRO_ANNUAL",
    });
  });

  it("maps configured price ids back to plan ids (monthly and annual)", () => {
    process.env.STRIPE_PRICE_STARTER = "price_starter";
    process.env.STRIPE_PRICE_PRO = " price_pro ";
    process.env.STRIPE_PRICE_AGENCY = "price_agency";
    process.env.STRIPE_PRICE_AGENCY_ANNUAL = "price_agency_year";

    expect(planForPriceId("price_pro")).toBe("pro");
    expect(planForPriceId("price_agency_year")).toBe("agency");
    expect(planForPriceId("price_unknown")).toBeNull();
    expect(billingIntervalForPriceId("price_agency_year")).toBe("year");
    expect(billingIntervalForPriceId("price_pro")).toBe("month");
  });

  it("builds a selected-plan subscribe next path with interval", () => {
    expect(paidPlanNextPath("agency")).toBe("/subscribe?plan=agency");
    expect(paidPlanNextPath("agency", "year")).toBe(
      "/subscribe?plan=agency&interval=year",
    );
  });

  it("does not default checkout price resolution without a selected plan", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro";

    expect(resolvePriceId({})).toEqual({
      priceId: null,
      usedEnv: "body.plan",
    });
  });

  it("resolves checkout body with plan and annual interval", () => {
    process.env.STRIPE_PRICE_STARTER_ANNUAL = "price_starter_year";

    expect(resolvePriceId({ plan: "starter", interval: "year" })).toEqual({
      priceId: "price_starter_year",
      usedEnv: "STRIPE_PRICE_STARTER_ANNUAL",
    });
  });

  it("resolves trialing companies to the selected paid plan tier", () => {
    process.env.STRIPE_PRICE_PRO = " price_pro\u200b";

    expect(
      getCompanyTier({
        id: "company-1",
        subscriptionStatus: "trialing",
        subscriptionPriceId: "price_pro",
      }),
    ).toBe("pro");
  });

  it("keeps a canceled company on its paid tier until access expires", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro";

    expect(
      getCompanyTier({
        id: "company-1",
        subscriptionStatus: "canceled",
        subscriptionPriceId: "price_pro",
        subscriptionCurrentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    ).toBe("pro");
  });

  it("drops failed-payment companies to the free tier immediately", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro";

    expect(
      getCompanyTier({
        id: "company-1",
        subscriptionStatus: "past_due",
        subscriptionPriceId: "price_pro",
        subscriptionCurrentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    ).toBe("free");
  });

  it("uses the same sanitized price mapping for pricing plan lookup", () => {
    process.env.STRIPE_PRICE_AGENCY = "\ufeffprice_agency";

    expect(getPlanByPriceId("price_agency").name).toBe("Agency");
  });
});
