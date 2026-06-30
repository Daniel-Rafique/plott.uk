/**
 * Create Plott subscription products + monthly/annual GBP prices on the
 * Stripe account for STRIPE_SECRET_KEY, with Price metadata from
 * scripts/stripe-plan-catalog.ts.
 *
 *   npm run stripe:create-products
 *
 * Run once per account (or when launching new price points). Then paste printed
 * lines into .env.local / Vercel and run npm run stripe:ensure-prices -- --fix
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";
import { catalogByPlanId, type PlanId } from "./stripe-plan-catalog";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const PLAN_IDS: PlanId[] = ["starter", "pro", "agency"];

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set (.env or .env.local).");
    process.exit(1);
  }

  const stripe = new Stripe(key, { typescript: true });
  const out: string[] = [];

  for (const planId of PLAN_IDS) {
    const entries = catalogByPlanId(planId);
    const first = entries[0];
    if (!first) continue;

    const product = await stripe.products.create({
      name: first.productName,
      description: first.productDescription,
    });

    for (const plan of entries) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.amountPence,
        currency: "gbp",
        recurring: { interval: plan.interval },
        nickname: plan.priceNickname,
        metadata: plan.metadata,
      });
      console.log(
        `${plan.label} (${plan.interval}): product ${product.id} — price ${price.id}`,
      );
      out.push(`${plan.envVar}="${price.id}"`);
    }
  }

  console.log("");
  console.log("=== Paste into .env.local and Vercel (replace old STRIPE_PRICE_*) ===");
  for (const line of out) console.log(line);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
