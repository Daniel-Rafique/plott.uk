import { afterEach, describe, expect, it } from "vitest";
import {
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

    expect(resolvePlanPriceId("pro")).toEqual({
      priceId: "price_pro",
      usedEnv: "STRIPE_PRICE_PRO",
    });
    expect(resolvePlanPriceId("agency")).toEqual({
      priceId: null,
      usedEnv: "STRIPE_PRICE_AGENCY",
    });
  });

  it("maps configured price ids back to plan ids", () => {
    process.env.STRIPE_PRICE_STARTER = "price_starter";
    process.env.STRIPE_PRICE_PRO = " price_pro ";
    process.env.STRIPE_PRICE_AGENCY = "price_agency";

    expect(planForPriceId("price_pro")).toBe("pro");
    expect(planForPriceId("price_unknown")).toBeNull();
  });

  it("builds a selected-plan subscribe next path", () => {
    expect(paidPlanNextPath("agency")).toBe("/subscribe?plan=agency");
  });

  it("does not default checkout price resolution without a selected plan", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro";

    expect(resolvePriceId({})).toEqual({
      priceId: null,
      usedEnv: "body.plan",
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
