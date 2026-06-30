/**
 * Ensure licensed extra-seat add-on prices exist for Pro and Agency.
 *
 *   npm run stripe:ensure-seat-prices
 *   npm run stripe:ensure-seat-prices -- --fix
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";
import { SEAT_ADDON_CATALOG } from "./stripe-seat-catalog";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

async function findSeatPrice(
  stripe: Stripe,
  entry: (typeof SEAT_ADDON_CATALOG)[number],
): Promise<Stripe.Price | null> {
  const configured = process.env[entry.envVar]?.trim();
  if (configured) {
    try {
      return await stripe.prices.retrieve(configured);
    } catch {
      console.warn(`Configured ${entry.envVar}=${configured} not found — will search`);
    }
  }

  for await (const price of stripe.prices.list({ limit: 100, active: true })) {
    if (
      price.currency === "gbp" &&
      price.unit_amount === entry.amountPence &&
      price.recurring?.interval === entry.interval &&
      price.metadata?.purpose === "extra_seat" &&
      price.metadata?.plan_id === entry.planId
    ) {
      return price;
    }
  }
  return null;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set.");
    process.exit(1);
  }

  const stripe = new Stripe(key, { typescript: true });
  const envLines: string[] = [];

  for (const entry of SEAT_ADDON_CATALOG) {
    let price = await findSeatPrice(stripe, entry);

    if (!price && fix) {
      const product = await stripe.products.create({
        name: entry.productName,
        metadata: { purpose: "extra_seat", plan_id: entry.planId },
      });
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: entry.amountPence,
        currency: "gbp",
        recurring: { interval: entry.interval },
        nickname: entry.priceNickname,
        metadata: {
          purpose: "extra_seat",
          plan_id: entry.planId,
        },
      });
      console.log(`CREATED ${entry.envVar} → ${price.id} (${product.id})`);
    }

    if (!price) {
      console.log(`MISSING ${entry.envVar} (${entry.priceNickname})`);
      continue;
    }

    if (price.unit_amount !== entry.amountPence) {
      console.log(
        `WARN ${entry.envVar}: amount ${price.unit_amount} ≠ expected ${entry.amountPence}`,
      );
    } else {
      console.log(`OK ${entry.envVar} → ${price.id}`);
    }
    envLines.push(`${entry.envVar}="${price.id}"`);
  }

  if (envLines.length) {
    console.log("\n=== Seat add-on env (paste into .env / Vercel) ===");
    for (const line of envLines) console.log(line);
  }

  if (!fix) {
    console.log("\nRe-run with --fix to create missing seat prices.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
