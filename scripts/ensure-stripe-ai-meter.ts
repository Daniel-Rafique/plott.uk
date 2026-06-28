/**
 * Ensures the AI overage Billing Meter (event_name: ai_overage) and a metered
 * GBP price exist on the current Stripe account. Matches src/lib/ai/metering.ts.
 *
 * Required env:
 *   STRIPE_SECRET_KEY
 *
 * Usage:
 *   npm run stripe:ensure-ai-meter
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const METER_EVENT_NAME = "ai_overage";
const METER_DISPLAY_NAME = "AI Overage (GBP pennies)";

async function findMeterByEventName(stripe: Stripe, eventName: string) {
  for await (const meter of stripe.billing.meters.list({ limit: 100 })) {
    if (meter.event_name === eventName) return meter;
  }
  return null;
}

async function findOveragePrice(stripe: Stripe) {
  for await (const price of stripe.prices.list({ limit: 100, active: true })) {
    if (price.metadata?.purpose === "ai_overage") return price;
    if (
      price.recurring?.usage_type === "metered" &&
      price.unit_amount === 1 &&
      price.currency === "gbp"
    ) {
      const recurringMeter = price.recurring.meter as string | { id: string } | null | undefined;
      const meterId =
        typeof recurringMeter === "string" ? recurringMeter : recurringMeter?.id;
      if (meterId) {
        const meter = await stripe.billing.meters.retrieve(meterId);
        if (meter.event_name === METER_EVENT_NAME) return price;
      }
    }
  }
  return null;
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set (.env or .env.local).");
    process.exit(1);
  }

  const stripe = new Stripe(key, { typescript: true });

  let meter = await findMeterByEventName(stripe, METER_EVENT_NAME);
  if (!meter) {
    meter = await stripe.billing.meters.create({
      display_name: METER_DISPLAY_NAME,
      event_name: METER_EVENT_NAME,
      default_aggregation: { formula: "sum" },
      value_settings: { event_payload_key: "value" },
      customer_mapping: {
        type: "by_id",
        event_payload_key: "stripe_customer_id",
      },
    });
    console.log(`Created billing meter: ${meter.id} (event_name=${METER_EVENT_NAME})`);
  } else {
    console.log(`OK billing meter: ${meter.id} (event_name=${METER_EVENT_NAME})`);
  }

  let price = await findOveragePrice(stripe);
  if (!price) {
    const product = await stripe.products.create({
      name: "Plott AI Overage",
      description: "Metered AI usage beyond included monthly allowance (1 unit = £0.01 of billed overage)",
      metadata: { purpose: "ai_overage" },
    });
    price = await stripe.prices.create({
      product: product.id,
      currency: "gbp",
      unit_amount: 1,
      nickname: "AI Overage (£0.01/unit — 1 unit = 1p billed)",
      recurring: {
        interval: "month",
        usage_type: "metered",
        meter: meter.id,
      },
      metadata: { purpose: "ai_overage" },
    });
    console.log(`Created metered price: ${price.id} on product ${product.id}`);
  } else {
    console.log(`OK metered overage price: ${price.id}`);
    if (price.nickname !== "AI Overage (£0.01/unit — 1 unit = 1p billed)") {
      await stripe.prices.update(price.id, {
        nickname: "AI Overage (£0.01/unit — 1 unit = 1p billed)",
      });
      console.log("  Updated price nickname for Dashboard clarity");
    }
    if (price.metadata?.purpose !== "ai_overage") {
      await stripe.prices.update(price.id, {
        metadata: { ...price.metadata, purpose: "ai_overage" },
      });
      console.log("  Updated price metadata purpose=ai_overage");
    }
  }

  console.log("");
  console.log("=== Paste into .env.local and Vercel (if not already set) ===");
  console.log(`STRIPE_PRICE_AI_OVERAGE="${price.id}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
