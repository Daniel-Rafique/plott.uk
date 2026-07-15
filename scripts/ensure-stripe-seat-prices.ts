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
import { MANAGED_PAYMENTS_TAX_CODE } from "./stripe-plan-catalog";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

async function findMatchingSeatPrice(
  stripe: Stripe,
  entry: (typeof SEAT_ADDON_CATALOG)[number],
): Promise<Stripe.Price | null> {
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

async function createSeatPrice(
  stripe: Stripe,
  entry: (typeof SEAT_ADDON_CATALOG)[number],
  productId?: string,
): Promise<Stripe.Price> {
  const product =
    productId ??
    (
      await stripe.products.create({
        name: entry.productName,
        tax_code: MANAGED_PAYMENTS_TAX_CODE,
        metadata: { purpose: "extra_seat", plan_id: entry.planId },
      })
    ).id;

  return stripe.prices.create({
    product,
    unit_amount: entry.amountPence,
    currency: "gbp",
    recurring: { interval: entry.interval },
    nickname: entry.priceNickname,
    metadata: {
      purpose: "extra_seat",
      plan_id: entry.planId,
    },
  });
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
    const configured = process.env[entry.envVar]?.trim();
    let configuredPrice: Stripe.Price | null = null;
    if (configured) {
      try {
        configuredPrice = await stripe.prices.retrieve(configured);
      } catch {
        console.warn(
          `Configured ${entry.envVar}=${configured} not found — will search`,
        );
      }
    }

    if (
      configuredPrice &&
      configuredPrice.unit_amount === entry.amountPence &&
      configuredPrice.active
    ) {
      console.log(`OK ${entry.envVar} → ${configuredPrice.id}`);
      envLines.push(`${entry.envVar}="${configuredPrice.id}"`);
      continue;
    }

    let price = await findMatchingSeatPrice(stripe, entry);

    if (!price && fix) {
      const productId =
        configuredPrice && typeof configuredPrice.product === "string"
          ? configuredPrice.product
          : undefined;
      price = await createSeatPrice(stripe, entry, productId);
      console.log(`CREATED ${entry.envVar} → ${price.id}`);
      if (configuredPrice?.active) {
        await stripe.prices.update(configuredPrice.id, { active: false });
        console.log(`DEACTIVATED old ${configuredPrice.id}`);
      }
    }

    if (!price) {
      if (configuredPrice) {
        console.log(
          `WARN ${entry.envVar}: amount ${configuredPrice.unit_amount} ≠ expected ${entry.amountPence} (${configuredPrice.id})`,
        );
        envLines.push(`${entry.envVar}="${configuredPrice.id}"`);
      } else {
        console.log(`MISSING ${entry.envVar} (${entry.priceNickname})`);
      }
      continue;
    }

    console.log(`OK ${entry.envVar} → ${price.id}`);
    envLines.push(`${entry.envVar}="${price.id}"`);
  }

  if (envLines.length) {
    console.log("\n=== Seat add-on env (paste into .env / Vercel) ===");
    for (const line of envLines) console.log(line);
  }

  if (!fix) {
    console.log("\nRe-run with --fix to create missing or amount-mismatched seat prices.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
