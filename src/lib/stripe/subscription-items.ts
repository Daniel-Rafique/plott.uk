import type Stripe from "stripe";
import { planForPriceId } from "@/lib/stripe/plan-prices";
import { configuredExtraSeatPriceIds } from "@/lib/stripe/seat-prices";

function priceFromItem(item: Stripe.SubscriptionItem): Stripe.Price | null {
  const price = item.price;
  if (!price || typeof price === "string") return null;
  return price;
}

function priceIdFromItem(item: Stripe.SubscriptionItem): string | null {
  const price = item.price;
  if (!price) return null;
  return typeof price === "string" ? price : price.id ?? null;
}

/** True when a Stripe Price is the AI overage metered line item. */
export function isMeteredOveragePrice(price: Stripe.Price): boolean {
  if (price.metadata?.purpose === "ai_overage") return true;
  return price.recurring?.usage_type === "metered";
}

/** True when a Stripe Price is the licensed extra-seat add-on. */
export function isExtraSeatPrice(price: Stripe.Price): boolean {
  if (price.metadata?.purpose === "extra_seat") return true;
  return configuredExtraSeatPriceIds().has(price.id);
}

function isLicensedPlanPrice(price: Stripe.Price): boolean {
  if (isMeteredOveragePrice(price) || isExtraSeatPrice(price)) return false;
  return planForPriceId(price.id) != null;
}

/** Licensed plan subscription item (monthly or annual tier price). */
export function licensedSubscriptionItem(
  sub: Stripe.Subscription,
): Stripe.SubscriptionItem | null {
  return (
    sub.items.data.find((item) => {
      const price = priceFromItem(item);
      if (price) return isLicensedPlanPrice(price);
      const id = priceIdFromItem(item);
      return id != null && planForPriceId(id) != null;
    }) ?? null
  );
}

export function licensedPriceId(sub: Stripe.Subscription): string | null {
  const item = licensedSubscriptionItem(sub);
  return item ? priceIdFromItem(item) : null;
}

export function overageSubscriptionItem(
  sub: Stripe.Subscription,
): Stripe.SubscriptionItem | null {
  return (
    sub.items.data.find((item) => {
      const price = priceFromItem(item);
      return price != null && isMeteredOveragePrice(price);
    }) ?? null
  );
}

export function seatAddonSubscriptionItem(
  sub: Stripe.Subscription,
): Stripe.SubscriptionItem | null {
  return (
    sub.items.data.find((item) => {
      const price = priceFromItem(item);
      return price != null && isExtraSeatPrice(price);
    }) ?? null
  );
}

/** Preserve licensed plan, metered overage, and optional seat add-on when swapping plan price. */
export function buildLicensedPlanUpdateItems(
  current: Stripe.Subscription,
  nextLicensedPriceId: string,
): Stripe.SubscriptionUpdateParams.Item[] {
  const licensed = licensedSubscriptionItem(current);
  const overage = overageSubscriptionItem(current);
  const seat = seatAddonSubscriptionItem(current);
  const items: Stripe.SubscriptionUpdateParams.Item[] = [];

  if (licensed) {
    items.push({
      id: licensed.id,
      price: nextLicensedPriceId,
      quantity: licensed.quantity ?? 1,
    });
  } else {
    items.push({ price: nextLicensedPriceId, quantity: 1 });
  }

  if (overage) {
    const overagePriceId = priceIdFromItem(overage);
    if (overagePriceId) {
      items.push({ id: overage.id, price: overagePriceId });
    }
  } else {
    const overageEnv = process.env.STRIPE_PRICE_AI_OVERAGE?.trim();
    if (overageEnv?.startsWith("price_")) {
      items.push({ price: overageEnv });
    }
  }

  if (seat) {
    const seatPriceId = priceIdFromItem(seat);
    if (seatPriceId) {
      items.push({
        id: seat.id,
        price: seatPriceId,
        quantity: seat.quantity ?? 1,
      });
    }
  }

  return items;
}
