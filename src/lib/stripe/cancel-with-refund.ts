import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/observability";

export type CancelWithRefundResult = {
  companyId: string;
  subscriptionId: string | null;
  canceled: boolean;
  refundedAmount: number;
  currency: string | null;
  skippedReason?: string;
};

function isRefundableStatus(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "past_due" || status === "unpaid";
}

/**
 * After a prorated cancel with invoice_now, Stripe typically leaves a customer
 * credit balance (negative). Refund that credit onto recent charges, then zero
 * the balance so the deleted customer is not left with stranded credit.
 */
async function refundCustomerCreditBalance(
  stripe: Stripe,
  customerId: string,
): Promise<{ refundedAmount: number; currency: string | null }> {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) {
    return { refundedAmount: 0, currency: null };
  }

  // Stripe: negative balance = credit owed to the customer.
  const credit = customer.balance;
  if (credit >= 0) {
    return { refundedAmount: 0, currency: customer.currency ?? null };
  }

  let remaining = Math.abs(credit);
  let refundedAmount = 0;
  const currency = customer.currency ?? "gbp";

  const charges = await stripe.charges.list({
    customer: customerId,
    limit: 20,
  });

  for (const charge of charges.data) {
    if (remaining <= 0) break;
    if (!charge.paid || charge.refunded) continue;
    const alreadyRefunded = charge.amount_refunded ?? 0;
    const refundable = charge.amount - alreadyRefunded;
    if (refundable <= 0) continue;

    const amount = Math.min(remaining, refundable);
    await stripe.refunds.create({
      charge: charge.id,
      amount,
      reason: "requested_by_customer",
      metadata: {
        reason: "account_deletion_unused_period",
      },
    });
    remaining -= amount;
    refundedAmount += amount;
  }

  // Clear any remaining Stripe credit balance after refunds (or if no charge
  // was refundable, still zero the ledger credit for a deleted account).
  const refreshed = await stripe.customers.retrieve(customerId);
  if (!refreshed.deleted && refreshed.balance !== 0) {
    await stripe.customers.createBalanceTransaction(customerId, {
      amount: -refreshed.balance,
      currency: refreshed.currency ?? currency,
      description: "Clear balance after account deletion refund",
      metadata: { reason: "account_deletion" },
    });
  }

  return { refundedAmount, currency };
}

/**
 * Cancel an active subscription immediately with unused-time proration, then
 * refund that credit to the customer's payment method.
 */
export async function cancelSubscriptionWithUnusedTimeRefund(options: {
  companyId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}): Promise<CancelWithRefundResult> {
  const { companyId, stripeCustomerId, stripeSubscriptionId } = options;
  const stripe = getStripe();

  if (!stripeSubscriptionId && !stripeCustomerId) {
    return {
      companyId,
      subscriptionId: null,
      canceled: false,
      refundedAmount: 0,
      currency: null,
      skippedReason: "no_stripe_billing",
    };
  }

  let canceled = false;
  let refundedAmount = 0;
  let currency: string | null = null;

  if (stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      if (sub.status === "canceled") {
        canceled = true;
      } else if (sub.status === "trialing") {
        // No paid unused time to refund during a free trial.
        await stripe.subscriptions.cancel(stripeSubscriptionId, {
          cancellation_details: {
            comment: "Account deleted during trial",
          },
        });
        canceled = true;
      } else if (isRefundableStatus(sub.status)) {
        await stripe.subscriptions.cancel(stripeSubscriptionId, {
          prorate: true,
          invoice_now: true,
          cancellation_details: {
            comment: "Account deleted by user — unused period credited",
          },
        });
        canceled = true;
      } else {
        await stripe.subscriptions.cancel(stripeSubscriptionId, {
          cancellation_details: {
            comment: `Account deleted (status=${sub.status})`,
          },
        });
        canceled = true;
      }
    } catch (err) {
      captureError(err, {
        companyId,
        extra: {
          action: "account_delete_cancel_subscription",
          subscriptionId: stripeSubscriptionId,
        },
      });
      logger.error(
        { err, companyId, stripeSubscriptionId },
        "account_delete_stripe_cancel_failed",
      );
      throw err;
    }
  }

  if (stripeCustomerId) {
    try {
      const refund = await refundCustomerCreditBalance(stripe, stripeCustomerId);
      refundedAmount = refund.refundedAmount;
      currency = refund.currency;
    } catch (err) {
      captureError(err, {
        companyId,
        extra: {
          action: "account_delete_refund_credit",
          customerId: stripeCustomerId,
        },
      });
      logger.error(
        { err, companyId, stripeCustomerId },
        "account_delete_stripe_refund_failed",
      );
      // Subscription is already canceled — continue account deletion rather
      // than blocking the user; support can finish a manual refund.
    }

    try {
      await stripe.customers.del(stripeCustomerId);
    } catch (err) {
      logger.warn(
        { err, companyId, stripeCustomerId },
        "account_delete_stripe_customer_delete_failed",
      );
    }
  }

  logger.info(
    {
      companyId,
      stripeSubscriptionId,
      canceled,
      refundedAmount,
      currency,
    },
    "account_delete_stripe_billing_settled",
  );

  return {
    companyId,
    subscriptionId: stripeSubscriptionId,
    canceled,
    refundedAmount,
    currency,
  };
}
