import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { getPostHogClient } from "@/lib/posthog-server";
import { logger } from "@/lib/logger";
import { invalidateStripeMetaCache } from "@/lib/ai/tiers";
import {
  applySubscription,
  applySubscriptionFromCompletedCheckout,
  firstPriceId,
  subscriptionPeriodEnd,
} from "@/lib/stripe/subscription-state";

export const runtime = "nodejs";

/** Invoice webhooks include `subscription` even when the types omit it. */
type InvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
};

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as InvoiceWithSubscription).subscription;
  if (typeof sub === "string") return sub;
  if (sub && typeof sub === "object" && "id" in sub) return sub.id;
  return null;
}

async function resolveCompanyId(
  sub: Stripe.Subscription,
  customerId: string | null,
): Promise<string | null> {
  const metaCompanyId = sub.metadata?.companyId;
  if (metaCompanyId) {
    const exists = await prisma.company.findUnique({
      where: { id: metaCompanyId },
      select: { id: true },
    });
    if (exists) return exists.id;
  }
  if (customerId) {
    const byCustomer = await prisma.company.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    if (byCustomer) return byCustomer.id;
  }
  // Last-ditch: legacy flows stored userId in metadata.
  const metaUserId = sub.metadata?.userId;
  if (metaUserId) {
    const membership = await prisma.membership.findFirst({
      where: { userId: metaUserId, role: "owner" },
      select: { companyId: true },
      orderBy: { createdAt: "asc" },
    });
    if (membership) return membership.companyId;
  }
  return null;
}

async function alreadyProcessed(eventId: string, type: string): Promise<boolean> {
  const result = await prisma.stripeEvent.createMany({
    data: { id: eventId, type },
    skipDuplicates: true,
  });
  return result.count === 0;
}

/**
 * Thrown when a webhook payload is structurally incomplete. Triggers the outer
 * catch which deletes the StripeEvent idempotency row, causing Stripe to retry
 * delivery. Useful for transient races where `subscription`/`customer` hasn't
 * propagated to the event payload yet.
 */
class WebhookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookPayloadError";
  }
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  const body = await req.text();
  const headerList = await headers();
  const sig = headerList.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (await alreadyProcessed(event.id, event.type)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") {
          logger.info(
            { eventId: event.id, mode: session.mode },
            "stripe_webhook_skip_non_subscription_checkout",
          );
          break;
        }
        try {
          await applySubscriptionFromCompletedCheckout(session);
        } catch (err) {
          logger.error(
            {
              err,
              eventId: event.id,
              sessionId: session.id,
            },
            "stripe_webhook_checkout_apply_failed",
          );
          throw new WebhookPayloadError(
            `checkout.session.completed apply failed (session=${session.id})`,
          );
        }
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : null;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        const companyId =
          session.metadata?.companyId ?? session.client_reference_id ?? "";
        getPostHogClient().capture({
          distinctId: session.metadata?.userId ?? companyId,
          event: "subscription_activated",
          properties: {
            company_id: companyId,
            price_id: firstPriceId(sub),
            subscription_status: sub.status,
            is_trial: Boolean(sub.trial_end),
          },
        });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;
        if (!customerId) {
          logger.error(
            { eventId: event.id, subId: sub.id },
            "stripe_webhook_subscription_missing_customer",
          );
          throw new WebhookPayloadError(
            `${event.type} missing customer id (sub=${sub.id})`,
          );
        }
        const companyId = await resolveCompanyId(sub, customerId);
        if (!companyId) {
          // Unresolvable customer → not one of ours (e.g. external Stripe
          // account webhook misrouted, or a customer we never persisted).
          // Log and ack — retries would loop forever.
          logger.warn(
            {
              eventId: event.id,
              subId: sub.id,
              customerId,
              metadata: sub.metadata,
            },
            "stripe_webhook_subscription_no_company_match",
          );
          break;
        }
        await applySubscription(companyId, customerId, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;
        if (!customerId) {
          logger.error(
            { eventId: event.id, subId: sub.id },
            "stripe_webhook_subscription_deleted_missing_customer",
          );
          throw new WebhookPayloadError(
            `customer.subscription.deleted missing customer id (sub=${sub.id})`,
          );
        }
        const companyId = await resolveCompanyId(sub, customerId);
        if (!companyId) {
          logger.warn(
            { eventId: event.id, subId: sub.id, customerId },
            "stripe_webhook_subscription_deleted_no_company_match",
          );
          break;
        }
        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: {
            stripeSubscriptionId: true,
            subscriptionPriceId: true,
          },
        });
        if (company?.stripeSubscriptionId && company.stripeSubscriptionId !== sub.id) {
          logger.info(
            {
              eventId: event.id,
              subId: sub.id,
              currentSubId: company.stripeSubscriptionId,
              companyId,
            },
            "stripe_webhook_skip_stale_subscription_deleted",
          );
          break;
        }
        // Preserve period/trial ends so customer-initiated cancellation keeps
        // access until the time Stripe had already granted. We intentionally
        // keep `stripeCustomerId` so re-subscription reuses the same customer.
        await prisma.company.update({
          where: { id: companyId },
          data: {
            stripeSubscriptionId: null,
            subscriptionStatus: "canceled",
            subscriptionPriceId:
              firstPriceId(sub) ?? company?.subscriptionPriceId ?? null,
            subscriptionCurrentPeriodEnd: subscriptionPeriodEnd(sub),
            trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
          },
        });
        getPostHogClient().capture({
          distinctId: sub.metadata?.userId ?? companyId,
          event: "subscription_cancelled",
          properties: {
            company_id: companyId,
            price_id: firstPriceId(sub),
          },
        });
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = subscriptionIdFromInvoice(invoice);
        if (!subId) {
          // Non-subscription invoice (one-time charge etc.) — legitimately not
          // something we need to sync.
          logger.info(
            { eventId: event.id, invoiceId: invoice.id },
            "stripe_webhook_skip_non_subscription_invoice",
          );
          break;
        }
        const sub = await stripe.subscriptions.retrieve(subId);
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;
        if (!customerId) {
          logger.error(
            { eventId: event.id, subId: sub.id, invoiceId: invoice.id },
            "stripe_webhook_invoice_missing_customer",
          );
          throw new WebhookPayloadError(
            `${event.type} sub missing customer id (sub=${sub.id})`,
          );
        }
        const companyId = await resolveCompanyId(sub, customerId);
        if (!companyId) {
          logger.warn(
            {
              eventId: event.id,
              subId: sub.id,
              customerId,
              invoiceId: invoice.id,
            },
            "stripe_webhook_invoice_no_company_match",
          );
          break;
        }
        await applySubscription(companyId, customerId, sub);
        break;
      }
      default:
        logger.debug(
          { eventId: event.id, type: event.type },
          "stripe_webhook_unhandled_event",
        );
        break;
    }
    // Any subscription-related event may have changed price metadata.
    invalidateStripeMetaCache();
  } catch (e) {
    logger.error(
      {
        err: e,
        eventId: event.id,
        eventType: event.type,
      },
      "stripe_webhook_handler_error",
    );
    // Roll back idempotency entry so Stripe retries the delivery.
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
