/**
 * Creates or updates Plott's second Stripe webhook endpoint for Klaviyo.
 *
 * This is separate from /api/webhooks/stripe, which remains the source of truth
 * for Plott subscription state and app entitlements.
 *
 * Required env:
 *   STRIPE_SECRET_KEY
 *   KLAVIYO_WEBHOOK_URL
 *
 * Usage:
 *   npm run stripe:ensure-klaviyo-webhook
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const KLAVIYO_STRIPE_EVENTS = [
  "charge.captured",
  "charge.expired",
  "charge.failed",
  "charge.pending",
  "charge.refunded",
  "charge.succeeded",
  "charge.updated",
  "invoice.created",
  "invoice.deleted",
  "invoice.finalized",
  "invoice.marked_uncollectible",
  "invoice.payment_action_required",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
  "invoice.sent",
  "invoice.upcoming",
  "invoice.updated",
  "invoice.voided",
] as const;

async function findEndpointByUrl(stripe: Stripe, url: string) {
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (endpoint.url === url) return endpoint;
  }
  return null;
}

function sameEvents(current: string[]) {
  const currentSet = new Set(current);
  return (
    current.length === KLAVIYO_STRIPE_EVENTS.length &&
    KLAVIYO_STRIPE_EVENTS.every((eventName) => currentSet.has(eventName))
  );
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const klaviyoUrl = process.env.KLAVIYO_WEBHOOK_URL?.trim();

  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set (.env or .env.local).");
    process.exit(1);
  }
  if (!klaviyoUrl) {
    console.error("KLAVIYO_WEBHOOK_URL is not set (.env or .env.local).");
    process.exit(1);
  }

  const stripe = new Stripe(key, { typescript: true });
  const existing = await findEndpointByUrl(stripe, klaviyoUrl);

  if (existing) {
    const needsEventsUpdate = !sameEvents(existing.enabled_events);
    const needsReenable = existing.status !== "enabled";
    if (!needsEventsUpdate && !needsReenable) {
      console.log(`OK Klaviyo Stripe webhook already configured: ${existing.id}`);
      console.log(`Enabled events: ${existing.enabled_events.length}`);
      return;
    }

    const updated = await stripe.webhookEndpoints.update(existing.id, {
      enabled_events: [...KLAVIYO_STRIPE_EVENTS],
      disabled: false,
      metadata: {
        ...(existing.metadata ?? {}),
        app: "plott",
        purpose: "klaviyo_stripe_integration",
      },
    });
    console.log(`Updated Klaviyo Stripe webhook: ${updated.id}`);
    console.log(`Enabled events: ${updated.enabled_events.length}`);
    console.log("Webhook signing secret is unchanged and cannot be re-displayed by Stripe.");
    return;
  }

  const created = await stripe.webhookEndpoints.create({
    url: klaviyoUrl,
    enabled_events: [...KLAVIYO_STRIPE_EVENTS],
    metadata: {
      app: "plott",
      purpose: "klaviyo_stripe_integration",
    },
  });

  console.log(`Created Klaviyo Stripe webhook: ${created.id}`);
  console.log(`Enabled events: ${created.enabled_events.length}`);
  if (created.secret) {
    console.log("");
    console.log("=== Store this value if Klaviyo asks for the Stripe signing secret ===");
    console.log(`KLAVIYO_WEBHOOK_SECRET=${created.secret}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
