/**
 * Create the three Plott subscription products + monthly GBP prices on the
 * Stripe account for STRIPE_SECRET_KEY, with Price metadata from
 * scripts/stripe-plan-catalog.ts (same as ensure-stripe-prices / docs).
 *
 *   npm run stripe:create-products
 *
 * Run once per account. Then paste printed lines into .env.local and run
 * npm run stripe:verify && npm run stripe:ensure-prices
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";
import { PLAN_CATALOG } from "./stripe-plan-catalog";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set (.env or .env.local).");
    process.exit(1);
  }

  const stripe = new Stripe(key, { typescript: true });
  const out: string[] = [];

  for (const plan of PLAN_CATALOG) {
    const product = await stripe.products.create({
      name: plan.productName,
      description: plan.productDescription,
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.amountPence,
      currency: "gbp",
      recurring: { interval: "month" },
      nickname: plan.priceNickname,
      metadata: plan.metadata,
    });
    console.log(`${plan.label}: product ${product.id} — price ${price.id} (metadata set)`);
    out.push(`${plan.envVar}="${price.id}"`);
  }

  console.log("");
  console.log("=== Paste into .env.local (replace any old STRIPE_PRICE_*) ===");
  for (const line of out) console.log(line);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
