import type Stripe from "stripe";

/** True when a Stripe Price is the AI overage metered line item. */
export function isMeteredOveragePrice(price: Stripe.Price): boolean {
  if (price.metadata?.purpose === "ai_overage") return true;
  return price.recurring?.usage_type === "metered";
}

/** Licensed (non-metered) subscription item — plan monthly or annual. */
export function licensedSubscriptionItem(
  sub: Stripe.Subscription,
): Stripe.SubscriptionItem | null {
  const licensed = sub.items.data.filter((item) => {
    const price = item.price;
    if (typeof price === "string") return true;
    return !isMeteredOveragePrice(price);
  });
  return licensed[0] ?? null;
}

export function licensedPriceId(sub: Stripe.Subscription): string | null {
  const item = licensedSubscriptionItem(sub);
  if (!item?.price) return null;
  if (typeof item.price === "string") return item.price;
  return item.price.id ?? null;
}

export function overageSubscriptionItem(
  sub: Stripe.Subscription,
): Stripe.SubscriptionItem | null {
  return (
    sub.items.data.find((item) => {
      const price = item.price;
      return typeof price !== "string" && isMeteredOveragePrice(price);
    }) ?? null
  );
}
