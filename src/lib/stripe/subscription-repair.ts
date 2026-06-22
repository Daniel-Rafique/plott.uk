import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { planForPriceId } from "@/lib/stripe/plan-prices";
import { applySubscription } from "@/lib/stripe/subscription-state";

const BILLING_ENTITLEMENT_STATUSES = new Set(["active", "trialing"]);

type RepairableCompany = {
  id: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string;
  subscriptionPriceId: string | null;
};

export type RepairedSubscriptionState = Pick<
  RepairableCompany,
  "subscriptionStatus" | "subscriptionPriceId"
>;

function subscriptionCustomerId(sub: Stripe.Subscription): string | null {
  return typeof sub.customer === "string" ? sub.customer : null;
}

function canUseSubscription(
  sub: Stripe.Subscription,
  customerId: string,
): boolean {
  return (
    BILLING_ENTITLEMENT_STATUSES.has(sub.status) &&
    subscriptionCustomerId(sub) === customerId &&
    sub.items.data.length > 0
  );
}

function firstItemPriceId(sub: Stripe.Subscription): string | undefined {
  const price = sub.items.data[0]?.price;
  if (!price) return undefined;
  return typeof price === "string" ? price : price.id;
}

async function retrieveStoredSubscription(
  stripe: Stripe,
  company: RepairableCompany,
): Promise<Stripe.Subscription | null> {
  if (!company.stripeSubscriptionId || !company.stripeCustomerId) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(company.stripeSubscriptionId);
    return canUseSubscription(sub, company.stripeCustomerId) ? sub : null;
  } catch {
    return null;
  }
}

async function findCustomerSubscription(
  stripe: Stripe,
  company: RepairableCompany,
): Promise<Stripe.Subscription | null> {
  if (!company.stripeCustomerId) return null;
  const subscriptions = await stripe.subscriptions.list({
    customer: company.stripeCustomerId,
    status: "all",
    limit: 20,
  });
  const usable = subscriptions.data.filter((sub) =>
    canUseSubscription(sub, company.stripeCustomerId!),
  );
  if (!usable.length) return null;
  const knownPaidPlan = usable.find((sub) => planForPriceId(firstItemPriceId(sub)));
  return knownPaidPlan ?? usable[0] ?? null;
}

export async function repairSubscriptionStateForEntitlements(
  companyId: string,
): Promise<RepairedSubscriptionState | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      subscriptionPriceId: true,
    },
  });
  if (!company) return null;
  if (!BILLING_ENTITLEMENT_STATUSES.has(company.subscriptionStatus)) {
    return {
      subscriptionStatus: company.subscriptionStatus,
      subscriptionPriceId: company.subscriptionPriceId,
    };
  }
  if (!company.stripeCustomerId || !process.env.STRIPE_SECRET_KEY?.trim()) {
    return {
      subscriptionStatus: company.subscriptionStatus,
      subscriptionPriceId: company.subscriptionPriceId,
    };
  }

  const stripe = getStripe();
  const subscription =
    (await retrieveStoredSubscription(stripe, company)) ??
    (await findCustomerSubscription(stripe, company));

  if (!subscription) {
    return {
      subscriptionStatus: company.subscriptionStatus,
      subscriptionPriceId: company.subscriptionPriceId,
    };
  }

  const stripePriceId = firstItemPriceId(subscription) ?? null;
  const storedPriceIsKnown = company.subscriptionPriceId
    ? Boolean(planForPriceId(company.subscriptionPriceId))
    : false;
  if (
    storedPriceIsKnown &&
    stripePriceId === company.subscriptionPriceId &&
    subscription.status === company.subscriptionStatus
  ) {
    return {
      subscriptionStatus: company.subscriptionStatus,
      subscriptionPriceId: company.subscriptionPriceId,
    };
  }

  await applySubscription(company.id, company.stripeCustomerId, subscription);
  const updated = await prisma.company.findUnique({
    where: { id: company.id },
    select: {
      subscriptionStatus: true,
      subscriptionPriceId: true,
    },
  });
  return updated;
}
