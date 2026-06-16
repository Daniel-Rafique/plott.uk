type SubscriptionEntitlementInput = {
  subscriptionStatus: string;
  subscriptionCurrentPeriodEnd?: Date | string | null;
  trialEndsAt?: Date | string | null;
};

type IntroTrialEligibilityInput = {
  subscriptionPriceId?: string | null;
  trialEndsAt?: Date | string | null;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function subscriptionAccessEndsAt(
  subscription: Pick<
    SubscriptionEntitlementInput,
    "subscriptionCurrentPeriodEnd" | "trialEndsAt"
  >,
): Date | null {
  const dates = [
    toDate(subscription.subscriptionCurrentPeriodEnd),
    toDate(subscription.trialEndsAt),
  ].filter((date): date is Date => Boolean(date));

  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

export function hasSubscriptionAccess(
  subscription: SubscriptionEntitlementInput,
  now = new Date(),
): boolean {
  if (ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.subscriptionStatus)) {
    return true;
  }

  if (subscription.subscriptionStatus !== "canceled") {
    return false;
  }

  const accessEnd = subscriptionAccessEndsAt(subscription);
  return Boolean(accessEnd && accessEnd.getTime() > now.getTime());
}

export function shouldOfferStripeIntroTrial(
  company: IntroTrialEligibilityInput,
): boolean {
  return !company.subscriptionPriceId && !company.trialEndsAt;
}
