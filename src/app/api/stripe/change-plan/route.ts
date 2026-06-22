import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getTenantContext } from "@/lib/tenant";
import { getStripe } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import { normalizePlan, resolvePlanPriceId } from "@/lib/stripe/plan-prices";
import { applySubscription, firstPriceId } from "@/lib/stripe/subscription-state";

export const runtime = "nodejs";

function subscriptionCustomerId(sub: Stripe.Subscription): string | null {
  return typeof sub.customer === "string" ? sub.customer : null;
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
      if (
        subscriptionCustomerId(sub) === customerId &&
        (sub.status === "active" || sub.status === "trialing")
      ) {
        return sub;
      }
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
    subscriptions.data.find(
      (sub) =>
        (sub.status === "active" || sub.status === "trialing") &&
        sub.items.data.length === 1,
    ) ?? null
  );
}

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { plan?: unknown } = {};
  try {
    body = (await req.json()) as { plan?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plan = normalizePlan(body.plan);
  if (!plan) {
    return NextResponse.json({ error: "Choose a valid plan." }, { status: 400 });
  }

  const { priceId, usedEnv } = resolvePlanPriceId(plan);
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

    const currentItem = current.items.data[0];
    if (!currentItem) {
      return NextResponse.json(
        { error: "Subscription has no subscription item to update." },
        { status: 409 },
      );
    }

    if (firstPriceId(current) === priceId) {
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
      items: [
        {
          id: currentItem.id,
          price: priceId,
          quantity: currentItem.quantity ?? 1,
        },
      ],
      metadata: {
        ...current.metadata,
        companyId: ctx.company.id,
        userId: ctx.user.id,
      },
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
    });

    await applySubscription(ctx.company.id, ctx.company.stripeCustomerId, updated);
    return NextResponse.json({
      ok: true,
      subscriptionId: updated.id,
      status: updated.status,
      priceId: firstPriceId(updated),
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
