import { afterEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  isExtraSeatPrice,
  isMeteredOveragePrice,
  licensedPriceId,
  licensedSubscriptionItem,
  overageSubscriptionItem,
  seatAddonSubscriptionItem,
} from "@/lib/stripe/subscription-items";

const ORIGINAL_ENV = { ...process.env };

function price(id: string, meta: Record<string, string> = {}): Stripe.Price {
  return {
    id,
    object: "price",
    metadata: meta,
    recurring: { interval: "month", usage_type: "licensed" },
  } as Stripe.Price;
}

function meteredPrice(id: string): Stripe.Price {
  return {
    id,
    object: "price",
    metadata: { purpose: "ai_overage" },
    recurring: { interval: "month", usage_type: "metered" },
  } as Stripe.Price;
}

function sub(items: Stripe.SubscriptionItem[]): Stripe.Subscription {
  return { items: { data: items } } as Stripe.Subscription;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("subscription-items", () => {
  it("detects metered overage and extra seat prices", () => {
    expect(isMeteredOveragePrice(meteredPrice("price_overage"))).toBe(true);
    process.env.STRIPE_PRICE_EXTRA_SEAT_PRO = "price_seat";
    expect(
      isExtraSeatPrice(
        price("price_seat", { purpose: "extra_seat", plan_id: "pro" }),
      ),
    ).toBe(true);
  });

  it("resolves licensed plan item when seat and overage items exist", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro";
    process.env.STRIPE_PRICE_EXTRA_SEAT_PRO = "price_seat";
    const subscription = sub([
      {
        id: "si_plan",
        price: price("price_pro"),
      } as Stripe.SubscriptionItem,
      {
        id: "si_seat",
        price: price("price_seat", { purpose: "extra_seat" }),
        quantity: 2,
      } as Stripe.SubscriptionItem,
      {
        id: "si_overage",
        price: meteredPrice("price_overage"),
      } as Stripe.SubscriptionItem,
    ]);

    expect(licensedPriceId(subscription)).toBe("price_pro");
    expect(licensedSubscriptionItem(subscription)?.id).toBe("si_plan");
    expect(seatAddonSubscriptionItem(subscription)?.quantity).toBe(2);
    expect(overageSubscriptionItem(subscription)?.id).toBe("si_overage");
  });
});
