/**
 * Creates or updates Plott's primary Stripe webhook for subscription state.
 * Separate from the Klaviyo webhook (npm run stripe:ensure-klaviyo-webhook).
 *
 * Required env:
 *   STRIPE_SECRET_KEY
 *
 * Optional:
 *   STRIPE_APP_WEBHOOK_URL — defaults to https://plott.uk/api/webhooks/stripe
 *
 * Usage:
 *   npm run stripe:ensure-app-webhook
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

/** Must match docs/stripe-new-account.md and src/app/api/webhooks/stripe/route.ts */
const APP_STRIPE_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.trial_will_end",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
] as const;

const DEFAULT_WEBHOOK_URL = "https://plott.uk/api/webhooks/stripe";

async function findEndpointByUrl(stripe: Stripe, url: string) {
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (endpoint.url === url) return endpoint;
  }
  return null;
}

function sameEvents(current: string[]) {
  const currentSet = new Set(current);
  return (
    current.length === APP_STRIPE_EVENTS.length &&
    APP_STRIPE_EVENTS.every((eventName) => currentSet.has(eventName))
  );
}

function resolveWebhookUrl(): string {
  const explicit = process.env.STRIPE_APP_WEBHOOK_URL?.trim();
  if (explicit) return explicit;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (appUrl && !appUrl.includes("localhost") && !appUrl.includes("127.0.0.1")) {
    return `${appUrl}/api/webhooks/stripe`;
  }

  return DEFAULT_WEBHOOK_URL;
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set (.env or .env.local).");
    process.exit(1);
  }

  const webhookUrl = resolveWebhookUrl();
  const stripe = new Stripe(key, { typescript: true });
  const existing = await findEndpointByUrl(stripe, webhookUrl);

  if (existing) {
    const needsEventsUpdate = !sameEvents(existing.enabled_events);
    const needsReenable = existing.status !== "enabled";
    if (!needsEventsUpdate && !needsReenable) {
      console.log(`OK Plott app webhook already configured: ${existing.id}`);
      console.log(`URL: ${webhookUrl}`);
      console.log(`Enabled events: ${existing.enabled_events.length}`);
      return;
    }

    const updated = await stripe.webhookEndpoints.update(existing.id, {
      enabled_events: [...APP_STRIPE_EVENTS],
      disabled: false,
      metadata: {
        ...(existing.metadata ?? {}),
        app: "plott",
        purpose: "subscription_entitlements",
      },
    });
    console.log(`Updated Plott app webhook: ${updated.id}`);
    console.log(`URL: ${webhookUrl}`);
    console.log(`Enabled events: ${updated.enabled_events.length}`);
    return;
  }

  const created = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: [...APP_STRIPE_EVENTS],
    metadata: {
      app: "plott",
      purpose: "subscription_entitlements",
    },
  });

  console.log(`Created Plott app webhook: ${created.id}`);
  console.log(`URL: ${webhookUrl}`);
  console.log(`Enabled events: ${created.enabled_events.length}`);
  if (created.secret) {
    console.log("");
    console.log("=== Paste into .env.local and Vercel ===");
    console.log(`STRIPE_WEBHOOK_SECRET=${created.secret}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
