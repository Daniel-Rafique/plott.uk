import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { trySendSubscriptionWelcomeEmail } from "@/lib/subscription-welcome-email";

export function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const ends = sub.items.data
    .map((item) => item.current_period_end)
    .filter((n): n is number => typeof n === "number");
  if (!ends.length) return null;
  return new Date(Math.max(...ends) * 1000);
}

export function firstPriceId(sub: Stripe.Subscription): string | null {
  const item = sub.items.data[0];
  if (!item) return null;
  if (typeof item.price === "string") return item.price;
  return item.price?.id ?? null;
}

function storedSubscriptionStatus(sub: Stripe.Subscription): string {
  if (
    sub.cancel_at_period_end &&
    (sub.status === "active" || sub.status === "trialing")
  ) {
    return "canceled";
  }
  return sub.status;
}

export async function applySubscription(
  companyId: string,
  customerId: string | null,
  sub: Stripe.Subscription,
) {
  await prisma.company.update({
    where: { id: companyId },
    data: {
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: storedSubscriptionStatus(sub),
      subscriptionPriceId: firstPriceId(sub) ?? undefined,
      subscriptionCurrentPeriodEnd: subscriptionPeriodEnd(sub),
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    },
  });
}

/**
 * Apply DB subscription state from a completed Checkout Session (mode =
 * subscription). Same logic as the `checkout.session.completed` webhook.
 */
export async function applySubscriptionFromCompletedCheckout(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "subscription") {
    throw new Error(`checkout session mode is ${session.mode}, not subscription`);
  }
  const companyId = session.metadata?.companyId ?? session.client_reference_id;
  const customerId =
    typeof session.customer === "string" ? session.customer : null;
  const subRaw = session.subscription;
  const subId =
    typeof subRaw === "string"
      ? subRaw
      : subRaw && typeof subRaw === "object" && "id" in subRaw
        ? subRaw.id
        : null;
  if (!companyId || !customerId || !subId) {
    throw new Error(
      "checkout session missing companyId, customer, or subscription",
    );
  }
  const stripe = getStripe();
  const sub =
    typeof subRaw === "object" && subRaw && "items" in subRaw
      ? (subRaw as Stripe.Subscription)
      : await stripe.subscriptions.retrieve(subId);
  await applySubscription(companyId, customerId, sub);
  await trySendSubscriptionWelcomeEmail(companyId, sub);
}
