import type Stripe from "stripe";
import type { Company } from "@prisma/client";
import { getStripe } from "@/lib/stripe";
import { applySubscription, firstPriceId } from "@/lib/stripe/subscription-state";
import type { PaidPlanId } from "@/lib/stripe/plan-prices";
import { resolvePlanPriceId } from "@/lib/stripe/plan-prices";

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
    sub.items.data.length > 0
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
    (sub) => firstPriceId(sub) === company.subscriptionPriceId,
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

export async function updateTrialSubscriptionPlan({
  company,
  plan,
}: {
  company: CompanySubscriptionState;
  plan: PaidPlanId;
}): Promise<Stripe.Subscription> {
  if (company.subscriptionStatus !== "trialing") {
    throw new TrialUpgradeError("Only trial subscriptions can use this upgrade flow.");
  }
  if (!company.stripeCustomerId) {
    throw new TrialUpgradeError("No Stripe customer on file. Subscribe first.");
  }

  const { priceId, usedEnv } = resolvePlanPriceId(plan);
  if (!priceId) {
    throw new TrialUpgradeError(
      `No Stripe price id for this plan. Set ${usedEnv} in the server environment.`,
      500,
    );
  }

  const stripe = getStripe();
  const current = await resolveTrialSubscription(stripe, company);
  const currentItem = current.items.data[0];
  if (!currentItem) {
    throw new TrialUpgradeError("Trial subscription has no subscription item.", 409);
  }

  if (firstPriceId(current) === priceId) {
    await applySubscription(company.id, company.stripeCustomerId, current);
    return current;
  }

  const updated = await stripe.subscriptions.update(current.id, {
    items: [{ id: currentItem.id, price: priceId }],
    proration_behavior: "none",
    metadata: {
      ...current.metadata,
      companyId: company.id,
    },
  });

  await applySubscription(company.id, company.stripeCustomerId, updated);
  return updated;
}
