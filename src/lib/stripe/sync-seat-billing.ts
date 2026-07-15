import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import {
  getCompanyBillingInterval,
  getCompanyPlan,
} from "@/lib/pricing";
import { getSeatUsage } from "@/lib/seats";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";
import { planForPriceId } from "@/lib/stripe/plan-prices";
import {
  planAllowsExtraSeats,
  resolveExtraSeatPriceId,
} from "@/lib/stripe/seat-prices";
import {
  licensedSubscriptionItem,
  overageSubscriptionItem,
  seatAddonSubscriptionItem,
} from "@/lib/stripe/subscription-items";

function subscriptionItemPriceId(
  item: Stripe.SubscriptionItem,
): string | null {
  if (!item.price) return null;
  return typeof item.price === "string" ? item.price : item.price.id ?? null;
}

function buildItemsPreservingAddons(
  sub: Stripe.Subscription,
  seatItem?: Stripe.SubscriptionUpdateParams.Item,
): Stripe.SubscriptionUpdateParams.Item[] {
  const licensed = licensedSubscriptionItem(sub);
  const overage = overageSubscriptionItem(sub);
  const items: Stripe.SubscriptionUpdateParams.Item[] = [];

  if (licensed) {
    const priceId = subscriptionItemPriceId(licensed);
    if (priceId) {
      items.push({
        id: licensed.id,
        price: priceId,
        quantity: licensed.quantity ?? 1,
      });
    }
  }

  if (overage) {
    const priceId = subscriptionItemPriceId(overage);
    if (priceId) {
      items.push({ id: overage.id, price: priceId });
    }
  }

  if (seatItem) {
    items.push(seatItem);
  }

  return items;
}

/**
 * Sync extra-seat subscription item quantity to match team size over plan limit.
 * No-op when seat add-on prices are unset or the company has no active subscription.
 */
export async function syncSeatBilling(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      subscriptionPriceId: true,
      subscriptionCurrentPeriodEnd: true,
      trialEndsAt: true,
    },
  });
  if (!company?.stripeSubscriptionId || !hasSubscriptionAccess(company)) {
    return;
  }

  const plan = getCompanyPlan(company);
  if (!planAllowsExtraSeats(plan.id)) return;

  const planId = planForPriceId(company.subscriptionPriceId ?? undefined);
  if (!planId || planId === "starter") return;

  const interval = getCompanyBillingInterval(company);
  const seatPriceId = resolveExtraSeatPriceId(planId, interval);
  if (!seatPriceId) return;

  const usage = await getSeatUsage(companyId);
  const quantity = usage.overage;

  const stripe = getStripe();
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(company.stripeSubscriptionId);
  } catch (err) {
    logger.warn({ err, companyId }, "sync_seat_billing_subscription_missing");
    return;
  }

  const existingSeat = seatAddonSubscriptionItem(sub);

  if (quantity <= 0) {
    if (existingSeat) {
      await stripe.subscriptionItems.del(existingSeat.id);
    }
    return;
  }

  if (existingSeat) {
    const currentPriceId = subscriptionItemPriceId(existingSeat);
    if (
      currentPriceId === seatPriceId &&
      (existingSeat.quantity ?? 0) === quantity
    ) {
      return;
    }
    await stripe.subscriptions.update(sub.id, {
      items: buildItemsPreservingAddons(sub, {
        id: existingSeat.id,
        price: seatPriceId,
        quantity,
      }),
      proration_behavior: "always_invoice",
    });
    return;
  }

  await stripe.subscriptions.update(sub.id, {
    items: buildItemsPreservingAddons(sub, {
      price: seatPriceId,
      quantity,
    }),
    proration_behavior: "always_invoice",
  });
}
