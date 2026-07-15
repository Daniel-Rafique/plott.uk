import type { BillingInterval } from "@/lib/stripe/plan-prices";
import type { PaidPlanId } from "@/lib/stripe/plan-prices";
import { sanitizePriceId } from "@/lib/stripe/plan-prices";

const SEAT_ENV: Partial<
  Record<PaidPlanId, Partial<Record<BillingInterval, string>>>
> = {
  pro: {
    month: "STRIPE_PRICE_EXTRA_SEAT_PRO",
    year: "STRIPE_PRICE_EXTRA_SEAT_PRO_ANNUAL",
  },
  agency: {
    month: "STRIPE_PRICE_EXTRA_SEAT_AGENCY",
    year: "STRIPE_PRICE_EXTRA_SEAT_AGENCY_ANNUAL",
  },
};

export function configuredExtraSeatPriceIds(): Set<string> {
  return new Set(
    Object.values(SEAT_ENV)
      .flatMap((intervals) => (intervals ? Object.values(intervals) : []))
      .map((envKey) => process.env[envKey])
      .filter((id): id is string => Boolean(id?.trim()))
      .map(sanitizePriceId),
  );
}

export function resolveExtraSeatPriceId(
  planId: PaidPlanId,
  interval: BillingInterval,
): string | null {
  const envKey = SEAT_ENV[planId]?.[interval];
  const raw = envKey ? process.env[envKey] : undefined;
  const id = raw?.trim();
  return id ? sanitizePriceId(id) : null;
}

/** True when a Stripe extra-seat price is configured for this plan (any interval). */
export function planAllowsExtraSeats(planId: string): boolean {
  if (planId !== "pro" && planId !== "agency") return false;
  return (
    resolveExtraSeatPriceId(planId, "month") != null ||
    resolveExtraSeatPriceId(planId, "year") != null
  );
}
