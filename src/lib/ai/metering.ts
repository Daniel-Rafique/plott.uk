/**
 * Reports AI overage usage to Stripe's metered billing API.
 *
 * When a company's AI spend exceeds the included monthly budget, the overage
 * amount (multiplied by the overage rate) is reported as a meter event. Stripe
 * aggregates these events and invoices them at the end of the billing cycle.
 *
 * Fire-and-forget — metering failures are logged but never block agent runs.
 */

import { logger } from "@/lib/logger";

const METER_EVENT_NAME = "ai_overage";

export async function reportAiOverage(opts: {
  companyId: string;
  stripeCustomerId: string;
  overageGbp: number;
  overageRate: number;
}): Promise<void> {
  const chargeGbp = opts.overageGbp * opts.overageRate;
  const pennies = Math.round(chargeGbp * 100);
  if (pennies <= 0) return;

  try {
    const { getStripe } = await import("@/lib/stripe");
    const stripe = getStripe();

    await stripe.billing.meterEvents.create({
      event_name: METER_EVENT_NAME,
      payload: {
        value: String(pennies),
        stripe_customer_id: opts.stripeCustomerId,
      },
    });

    logger.info(
      {
        companyId: opts.companyId,
        stripeCustomerId: opts.stripeCustomerId,
        overageGbp: opts.overageGbp,
        overageRate: opts.overageRate,
        chargedPennies: pennies,
      },
      "ai_overage_reported",
    );
  } catch (err) {
    logger.error(
      {
        err,
        companyId: opts.companyId,
        stripeCustomerId: opts.stripeCustomerId,
        overageGbp: opts.overageGbp,
      },
      "ai_overage_report_failed",
    );
  }
}
