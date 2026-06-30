import type Stripe from "stripe";
import type { Company } from "@prisma/client";
import { getStripe } from "@/lib/stripe";
import {
  licensedPriceId,
  licensedSubscriptionItem,
  overageSubscriptionItem,
} from "@/lib/stripe/subscription-items";
import { applySubscription } from "@/lib/stripe/subscription-state";
import type { BillingInterval, PaidPlanId } from "@/lib/stripe/plan-prices";
import {
  normalizeBillingInterval,
  resolvePlanPriceId,
} from "@/lib/stripe/plan-prices";

export class TrialUpgradeError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TrialUpgradeError";
    this.status = status;
  }
}

type CompanySubscriptionState = Pick<
  Company,
  | "id"
  | "stripeCustomerId"
  | "subscriptionStatus"
  | "subscriptionPriceId"
> & {
  stripeSubscriptionId?: string | null;
};

function subscriptionCustomerId(sub: Stripe.Subscription): string | null {
  return typeof sub.customer === "string" ? sub.customer : null;
}

function isUsableTrialSubscription(
  sub: Stripe.Subscription,
  customerId: string,
): boolean {
  return (
    sub.status === "trialing" &&
    subscriptionCustomerId(sub) === customerId &&
    licensedSubscriptionItem(sub) != null
  );
}

async function retrieveStoredTrialSubscription(
  stripe: Stripe,
  company: CompanySubscriptionState,
): Promise<Stripe.Subscription | null> {
  if (!company.stripeSubscriptionId || !company.stripeCustomerId) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(company.stripeSubscriptionId);
    if (isUsableTrialSubscription(sub, company.stripeCustomerId)) return sub;
  } catch {
    return null;
  }
  return null;
}

async function findTrialSubscriptionForCustomer(
  stripe: Stripe,
  company: CompanySubscriptionState,
): Promise<Stripe.Subscription | null> {
  if (!company.stripeCustomerId) return null;
  const subscriptions = await stripe.subscriptions.list({
    customer: company.stripeCustomerId,
    status: "all",
    limit: 20,
  });
  const trials = subscriptions.data.filter((sub) =>
    isUsableTrialSubscription(sub, company.stripeCustomerId!),
  );
  if (!trials.length) return null;
  const matchingCurrentPrice = trials.find(
    (sub) => licensedPriceId(sub) === company.subscriptionPriceId,
  );
  return matchingCurrentPrice ?? trials[0] ?? null;
}

async function resolveTrialSubscription(
  stripe: Stripe,
  company: CompanySubscriptionState,
): Promise<Stripe.Subscription> {
  const stored = await retrieveStoredTrialSubscription(stripe, company);
  if (stored) return stored;

  const fallback = await findTrialSubscriptionForCustomer(stripe, company);
  if (fallback) return fallback;

  throw new TrialUpgradeError(
    "Could not find an active trial subscription to update.",
    404,
  );
}

function buildSubscriptionUpdateItems(
  current: Stripe.Subscription,
  licensedPriceId: string,
): Stripe.SubscriptionUpdateParams.Item[] {
  const licensed = licensedSubscriptionItem(current);
  const overage = overageSubscriptionItem(current);
  const items: Stripe.SubscriptionUpdateParams.Item[] = [];
  if (licensed) {
    items.push({
      id: licensed.id,
      price: licensedPriceId,
      quantity: licensed.quantity ?? 1,
    });
  } else {
    items.push({ price: licensedPriceId, quantity: 1 });
  }
  if (overage) {
    const overagePriceId =
      typeof overage.price === "string" ? overage.price : overage.price?.id;
    if (overagePriceId) {
      items.push({ id: overage.id, price: overagePriceId });
    }
  }
  return items;
}

export async function updateTrialSubscriptionPlan({
  company,
  plan,
  interval = "month",
}: {
  company: CompanySubscriptionState;
  plan: PaidPlanId;
  interval?: BillingInterval;
}): Promise<Stripe.Subscription> {
  if (company.subscriptionStatus !== "trialing") {
    throw new TrialUpgradeError("Only trial subscriptions can use this upgrade flow.");
  }
  if (!company.stripeCustomerId) {
    throw new TrialUpgradeError("No Stripe customer on file. Subscribe first.");
  }

  const billingInterval = normalizeBillingInterval(interval);
  const { priceId, usedEnv } = resolvePlanPriceId(plan, billingInterval);
  if (!priceId) {
    throw new TrialUpgradeError(
      `No Stripe price id for this plan. Set ${usedEnv} in the server environment.`,
      500,
    );
  }

  const stripe = getStripe();
  const current = await resolveTrialSubscription(stripe, company);

  if (licensedPriceId(current) === priceId) {
    await applySubscription(company.id, company.stripeCustomerId, current);
    return current;
  }

  const updated = await stripe.subscriptions.update(current.id, {
    items: buildSubscriptionUpdateItems(current, priceId),
    proration_behavior: "none",
    metadata: {
      ...current.metadata,
      companyId: company.id,
    },
  });

  await applySubscription(company.id, company.stripeCustomerId, updated);
  return updated;
}
