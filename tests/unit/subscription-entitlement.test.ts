import { describe, expect, it } from "vitest";
import {
  hasSubscriptionAccess,
  shouldOfferStripeIntroTrial,
  subscriptionAccessEndsAt,
} from "@/lib/subscription-entitlement";

const NOW = new Date("2026-05-02T12:00:00.000Z");
const FUTURE = new Date("2026-05-03T12:00:00.000Z");
const PAST = new Date("2026-05-01T12:00:00.000Z");

describe("subscription entitlement policy", () => {
  it("allows active and trialing subscriptions", () => {
    expect(
      hasSubscriptionAccess({ subscriptionStatus: "active" }, NOW),
    ).toBe(true);
    expect(
      hasSubscriptionAccess({ subscriptionStatus: "trialing" }, NOW),
    ).toBe(true);
  });

  it("allows canceled subscriptions until their future access end", () => {
    expect(
      hasSubscriptionAccess(
        {
          subscriptionStatus: "canceled",
          subscriptionCurrentPeriodEnd: FUTURE,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("uses the latest available access end for canceled subscriptions", () => {
    expect(
      subscriptionAccessEndsAt({
        subscriptionCurrentPeriodEnd: PAST,
        trialEndsAt: FUTURE,
      })?.toISOString(),
    ).toBe(FUTURE.toISOString());
  });

  it("blocks canceled subscriptions after the access end", () => {
    expect(
      hasSubscriptionAccess(
        {
          subscriptionStatus: "canceled",
          subscriptionCurrentPeriodEnd: PAST,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("blocks failed-payment states immediately", () => {
    expect(
      hasSubscriptionAccess(
        {
          subscriptionStatus: "past_due",
          subscriptionCurrentPeriodEnd: FUTURE,
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      hasSubscriptionAccess(
        {
          subscriptionStatus: "unpaid",
          subscriptionCurrentPeriodEnd: FUTURE,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("offers the Stripe intro trial only before any subscription is synced", () => {
    expect(
      shouldOfferStripeIntroTrial({
        subscriptionPriceId: null,
        trialEndsAt: null,
      }),
    ).toBe(true);
    expect(
      shouldOfferStripeIntroTrial({
        subscriptionPriceId: "price_123",
        trialEndsAt: null,
      }),
    ).toBe(false);
    expect(
      shouldOfferStripeIntroTrial({
        subscriptionPriceId: null,
        trialEndsAt: PAST,
      }),
    ).toBe(false);
  });
});
