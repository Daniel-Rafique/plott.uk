import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getTenantContext } from "@/lib/tenant";
import { getStripe } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import { sendSubscriptionPlanChangedEmail } from "@/lib/email";
import {
  licensedPriceId,
  licensedSubscriptionItem,
  overageSubscriptionItem,
} from "@/lib/stripe/subscription-items";
import {
  normalizeBillingInterval,
  normalizePlan,
  resolvePlanPriceId,
  type BillingInterval,
} from "@/lib/stripe/plan-prices";
import {
  applySubscription,
  subscriptionPeriodEnd,
} from "@/lib/stripe/subscription-state";

export const runtime = "nodejs";

function subscriptionCustomerId(sub: Stripe.Subscription): string | null {
  return typeof sub.customer === "string" ? sub.customer : null;
}

function planLabel(plan: string): string {
  return plan[0].toUpperCase() + plan.slice(1);
}

function subscriptionPrice(sub: Stripe.Subscription): Stripe.Price | null {
  const item = licensedSubscriptionItem(sub);
  const price = item?.price;
  return price && typeof price !== "string" ? price : null;
}

function formatPriceLabel(price: Stripe.Price | null): string | null {
  if (!price?.currency) return null;
  const minor =
    price.unit_amount != null
      ? price.unit_amount
      : price.unit_amount_decimal != null
        ? Math.round(Number(price.unit_amount_decimal))
        : null;
  if (minor == null) return null;
  const amount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
  const interval = price.recurring?.interval;
  return interval ? `${amount} / ${interval}` : amount;
}

function includedAiCreditGbp(price: Stripe.Price | null): number | null {
  const raw = price?.metadata?.ai_monthly_budget_gbp;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isActiveSubscription(sub: Stripe.Subscription, customerId: string): boolean {
  return (
    (sub.status === "active" || sub.status === "trialing") &&
    subscriptionCustomerId(sub) === customerId &&
    licensedSubscriptionItem(sub) != null
  );
}

async function resolveActiveSubscription({
  stripe,
  customerId,
  subscriptionId,
}: {
  stripe: Stripe;
  customerId: string;
  subscriptionId: string | null;
}): Promise<Stripe.Subscription | null> {
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      if (isActiveSubscription(sub, customerId)) return sub;
    } catch (err) {
      logger.warn(
        { err, customerId, subscriptionId },
        "stripe_change_plan_stored_subscription_unusable",
      );
    }
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });
  return (
    subscriptions.data.find((sub) => isActiveSubscription(sub, customerId)) ?? null
  );
}

function buildSubscriptionUpdateItems(
  current: Stripe.Subscription,
  nextLicensedPriceId: string,
): Stripe.SubscriptionUpdateParams.Item[] {
  const licensed = licensedSubscriptionItem(current);
  const overage = overageSubscriptionItem(current);
  const items: Stripe.SubscriptionUpdateParams.Item[] = [];
  if (licensed) {
    items.push({
      id: licensed.id,
      price: nextLicensedPriceId,
      quantity: licensed.quantity ?? 1,
    });
  } else {
    items.push({ price: nextLicensedPriceId, quantity: 1 });
  }
  if (overage) {
    const overagePriceId =
      typeof overage.price === "string" ? overage.price : overage.price.id;
    items.push({ id: overage.id, price: overagePriceId });
  } else {
    const overageEnv = process.env.STRIPE_PRICE_AI_OVERAGE?.trim();
    if (overageEnv?.startsWith("price_")) {
      items.push({ price: overageEnv });
    }
  }
  return items;
}

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { plan?: unknown; interval?: unknown } = {};
  try {
    body = (await req.json()) as { plan?: unknown; interval?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plan = normalizePlan(body.plan);
  if (!plan) {
    return NextResponse.json({ error: "Choose a valid plan." }, { status: 400 });
  }

  const interval: BillingInterval = normalizeBillingInterval(body.interval);

  const { priceId, usedEnv } = resolvePlanPriceId(plan, interval);
  if (!priceId) {
    return NextResponse.json(
      {
        error: `No Stripe price id for this plan. Set ${usedEnv} in the server environment.`,
        usedEnv,
      },
      { status: 500 },
    );
  }

  if (!ctx.company.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer on file. Subscribe first." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  try {
    const current = await resolveActiveSubscription({
      stripe,
      customerId: ctx.company.stripeCustomerId,
      subscriptionId: ctx.company.stripeSubscriptionId,
    });
    if (!current) {
      return NextResponse.json(
        { error: "Could not find an active subscription to update." },
        { status: 404 },
      );
    }

    if (licensedPriceId(current) === priceId) {
      await applySubscription(ctx.company.id, ctx.company.stripeCustomerId, current);
      return NextResponse.json({
        ok: true,
        subscriptionId: current.id,
        status: current.status,
        priceId,
        unchanged: true,
      });
    }

    const updated = await stripe.subscriptions.update(current.id, {
      items: buildSubscriptionUpdateItems(current, priceId),
      metadata: {
        ...current.metadata,
        companyId: ctx.company.id,
        userId: ctx.user.id,
      },
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
    });

    await applySubscription(ctx.company.id, ctx.company.stripeCustomerId, updated);
    if (ctx.user.email) {
      const price = subscriptionPrice(updated);
      sendSubscriptionPlanChangedEmail({
        to: ctx.user.email,
        companyName: ctx.company.name,
        planName: planLabel(plan),
        priceLabel: formatPriceLabel(price),
        renewalDate: subscriptionPeriodEnd(updated),
        includedAiCreditGbp: includedAiCreditGbp(price),
      }).catch((emailErr) => {
        logger.warn(
          { err: emailErr, companyId: ctx.company.id, plan },
          "stripe_change_plan_confirmation_email_failed",
        );
      });
    }
    return NextResponse.json({
      ok: true,
      subscriptionId: updated.id,
      status: updated.status,
      priceId: licensedPriceId(updated),
    });
  } catch (err) {
    logger.error(
      { err, companyId: ctx.company.id, plan, priceId },
      "stripe_change_plan_failed",
    );
    return NextResponse.json(
      { error: "Could not change subscription plan." },
      { status: 502 },
    );
  }
}
