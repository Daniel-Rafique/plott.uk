import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getTenantContext } from "@/lib/tenant";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  normalizePlan,
  planForPriceId,
  resolvePriceId,
  type PriceRequest,
} from "@/lib/stripe/plan-prices";
import {
  TrialUpgradeError,
  updateTrialSubscriptionPlan,
} from "@/lib/stripe/trial-upgrade";
import { shouldOfferStripeIntroTrial } from "@/lib/subscription-entitlement";

export const runtime = "nodejs";

type StripeErrorShape = {
  type?: string;
  code?: string;
  statusCode?: number;
  param?: string;
  message?: string;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "";
}

/**
 * stripe-node v22+ often sets `type` to `invalid_request_error` (API string),
 * not `StripeInvalidRequestError`. Match both.
 */
function asStripeError(err: unknown): StripeErrorShape | null {
  if (!err || typeof err !== "object") return null;
  const e = err as StripeErrorShape;
  if (
    e.type &&
    e.type !== "StripeInvalidRequestError" &&
    e.type !== "invalid_request_error"
  ) {
    return null;
  }
  if (e.code !== "resource_missing" && e.statusCode !== 404) return null;
  return e;
}

/**
 * True when the missing resource is specifically the Stripe customer — e.g.
 * env keys rotated to a different account, or the customer was deleted in the
 * dashboard. We self-heal by clearing the stale id.
 *
 * Crucially, we do NOT return true when the missing resource is the price
 * (that means the env STRIPE_PRICE_* is wrong, not the customer) or any other
 * unrelated resource — otherwise we'd keep wiping a valid customer forever.
 */
function isMissingCustomerError(err: unknown): boolean {
  if (/no such customer/i.test(getErrorMessage(err))) return true;
  const e = asStripeError(err);
  if (!e) return false;
  if (e.param === "customer") return true;
  return /no such customer/i.test(e.message ?? "");
}

function isMissingPriceError(err: unknown): boolean {
  if (/no such price/i.test(getErrorMessage(err))) return true;
  const e = asStripeError(err);
  if (!e) return false;
  if (
    e.param === "price" ||
    e.param?.includes("[price]") ||
    e.param?.includes("line_items")
  ) {
    return true;
  }
  return /no such price/i.test(e.message ?? "");
}

function canFallBackToCheckoutFromTrialUpgrade(err: TrialUpgradeError): boolean {
  return (
    err.status === 404 ||
    /no stripe customer on file/i.test(err.message) ||
    /could not find an active trial subscription/i.test(err.message)
  );
}

async function ensureCustomerId(
  stripe: Stripe,
  ctx: Awaited<ReturnType<typeof getTenantContext>>,
): Promise<string> {
  if (!ctx) throw new Error("Tenant context required");
  const existing = ctx.company.stripeCustomerId;
  if (existing) {
    try {
      const customer = await stripe.customers.retrieve(existing);
      if (!customer.deleted) return existing;
      logger.warn(
        { companyId: ctx.company.id, stripeCustomerId: existing },
        "stripe_customer_deleted_recreating",
      );
    } catch (err) {
      if (!isMissingCustomerError(err)) throw err;
      logger.warn(
        { companyId: ctx.company.id, stripeCustomerId: existing },
        "stripe_customer_missing_recreating",
      );
    }
    await prisma.company.update({
      where: { id: ctx.company.id },
      data: { stripeCustomerId: null },
    });
  }

  const customer = await stripe.customers.create({
    email: ctx.user.email ?? undefined,
    name: ctx.company.name,
    metadata: {
      companyId: ctx.company.id,
      userId: ctx.user.id,
    },
  });
  await prisma.company.update({
    where: { id: ctx.company.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PriceRequest = {};
  try {
    body = (await req.json()) as PriceRequest;
  } catch {
    // empty body is fine — we fall back to default price
  }

  const plan = normalizePlan(body.plan) ?? planForPriceId(body.priceId);
  body = { ...body, plan: plan ?? undefined };

  if (ctx.company.subscriptionStatus === "trialing") {
    if (!plan) {
      return NextResponse.json(
        { error: "Choose a valid plan to update your trial." },
        { status: 400 },
      );
    }
    try {
      await updateTrialSubscriptionPlan({ company: ctx.company, plan });
      const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
      return NextResponse.json({
        url: `${origin}/app/settings/billing?trial_upgrade=success`,
      });
    } catch (err) {
      if (err instanceof TrialUpgradeError) {
        if (canFallBackToCheckoutFromTrialUpgrade(err)) {
          logger.warn(
            { err, companyId: ctx.company.id, plan },
            "stripe_trial_upgrade_falling_back_to_checkout",
          );
        } else {
          return NextResponse.json(
            { error: err.message },
            { status: err.status },
          );
        }
      } else {
        logger.error(
          { err, companyId: ctx.company.id, plan },
          "stripe_checkout_trial_upgrade_failed",
        );
        return NextResponse.json(
          { error: "Could not update trial subscription." },
          { status: 502 },
        );
      }
    }
  }

  const { priceId, usedEnv } = resolvePriceId(body);
  if (!priceId) {
    const tierKeys = "STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_AGENCY";
    const isTierKey =
      usedEnv === "STRIPE_PRICE_STARTER" ||
      usedEnv === "STRIPE_PRICE_PRO" ||
      usedEnv === "STRIPE_PRICE_AGENCY";
    return NextResponse.json(
      {
        error: isTierKey
          ? `No Stripe price id for this plan. Set ${usedEnv} in the server environment to your Dashboard price_... (same test/live mode as STRIPE_SECRET_KEY), then redeploy. If you use Vercel Preview, add ${usedEnv} for Preview too — it is easy to set Starter/Pro for Production only and miss Agency.`
          : usedEnv === "body.plan"
            ? "Choose a paid plan to start checkout."
          : `Invalid Stripe price. Choose a configured plan or set ${tierKeys} in env.`,
        usedEnv,
        hint: isTierKey
          ? "Often Agency alone still points at an old price_ id: update or remove duplicate env rows in Vercel, then Redeploy."
          : undefined,
      },
      { status: usedEnv === "body.plan" ? 400 : 500 },
    );
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
  const stripe = getStripe();

  let customerId: string;
  try {
    customerId = await ensureCustomerId(stripe, ctx);
  } catch (err) {
    logger.error(
      { err, companyId: ctx.company.id },
      "stripe_customer_ensure_failed",
    );
    return NextResponse.json(
      { error: "Could not resolve Stripe customer. Please try again." },
      { status: 502 },
    );
  }

  const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === "true";
  const trialDays = Number(process.env.STRIPE_TRIAL_DAYS ?? "14");
  const trialPeriodDays =
    shouldOfferStripeIntroTrial(ctx.company) &&
    Number.isFinite(trialDays) &&
    trialDays > 0
      ? trialDays
      : undefined;

  // One-minute idempotency bucket: rapid double-submits collapse to a single
  // Stripe Checkout Session while still allowing a genuine retry a minute later.
  const idempotencyBucket = Math.floor(Date.now() / 60_000);
  const idempotencyKey = `checkout-${ctx.company.id}-${priceId}-${idempotencyBucket}`;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        // Land back on /subscribe — it detects `?checkout=success` and shows
        // an activating spinner while the webhook catches up, then redirects
        // forward to /app/dashboard once resolveStage() sees the subscription.
        success_url: `${origin}/subscribe?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/subscribe?checkout=cancelled`,
        client_reference_id: ctx.company.id,
        metadata: {
          userId: ctx.user.id,
          companyId: ctx.company.id,
        },
        subscription_data: {
          metadata: {
            userId: ctx.user.id,
            companyId: ctx.company.id,
          },
          trial_period_days: trialPeriodDays,
        },
        billing_address_collection: "required",
        customer_update: {
          address: "auto",
          name: "auto",
        },
        tax_id_collection: { enabled: true },
        automatic_tax: { enabled: automaticTax },
        allow_promotion_codes: true,
      },
      { idempotencyKey },
    );
  } catch (err) {
    // Self-heal once: if the customer we just verified disappeared between
    // retrieve() and session creation, clear the id and bail with a 409 so
    // the client retries with a fresh request. We ONLY do this for genuine
    // customer-missing errors — a missing priceId looks nearly identical to
    // Stripe's generic resource_missing code and must not wipe the customer.
    if (isMissingCustomerError(err)) {
      logger.warn(
        { companyId: ctx.company.id, customerId },
        "stripe_checkout_customer_missing_clearing",
      );
      await prisma.company
        .update({
          where: { id: ctx.company.id },
          data: { stripeCustomerId: null },
        })
        .catch(() => {});
      return NextResponse.json(
        { error: "Stripe customer was stale — please retry." },
        { status: 409 },
      );
    }
    if (isMissingPriceError(err)) {
      const key = process.env.STRIPE_SECRET_KEY ?? "";
      const keyMode = key.includes("_test_")
        ? "test"
        : key.includes("_live_")
          ? "live"
          : "unknown";
      logger.error(
        { err, companyId: ctx.company.id, priceId, usedEnv, keyMode },
        "stripe_checkout_price_missing",
      );
      return NextResponse.json(
        {
          error:
            "The selected plan price isn't available in Stripe. Check STRIPE_PRICE_* env vars match the current Stripe account.",
          usedEnv,
          priceId,
          hint:
            keyMode === "test"
              ? "Secret key is TEST (sk_test_). Each STRIPE_PRICE_* must be a price id from Stripe Dashboard with Test mode on."
              : keyMode === "live"
                ? "Secret key is LIVE (sk_live_). Create or copy each price id in Dashboard with Test mode off — test price ids do not work with live keys."
                : "Ensure STRIPE_SECRET_KEY and all STRIPE_PRICE_* values are from the same Stripe account and the same test/live mode.",
        },
        { status: 500 },
      );
    }
    logger.error(
      { err, companyId: ctx.company.id, priceId },
      "stripe_checkout_create_failed",
    );
    return NextResponse.json(
      { error: "Could not create checkout session" },
      { status: 502 },
    );
  }

  if (!session.url) {
    return NextResponse.json(
      { error: "Could not create checkout session" },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: session.url });
}
