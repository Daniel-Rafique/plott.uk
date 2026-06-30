/**
 * Verifies (and optionally sets) Plott Stripe Price metadata and env price IDs
 * for the current account. Uses scripts/stripe-plan-catalog.ts.
 *
 *   npx tsx scripts/ensure-stripe-prices.ts           # check only, exit 1 on mismatch
 *   npx tsx scripts/ensure-stripe-prices.ts --fix     # apply missing/wrong metadata
 *
 * Requires STRIPE_SECRET_KEY and all STRIPE_PRICE_* vars in .env / .env.local
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";
import { PLAN_CATALOG } from "./stripe-plan-catalog";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

function mergeMetadata(
  price: Stripe.Price,
): Record<string, string> {
  const p =
    typeof price.product === "object" && price.product && "metadata" in price.product
      ? (price.product as Stripe.Product).metadata
      : {};
  return { ...p, ...price.metadata };
}

function needsUpdate(
  current: Record<string, string>,
  required: Record<string, string>,
): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(required)) {
    if (current[k] !== v) keys.push(k);
  }
  return keys;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set (.env or .env.local).");
    process.exit(1);
  }

  const stripe = new Stripe(key, { typescript: true });

  let hasError = false;

  for (const tier of PLAN_CATALOG) {
    const priceId = process.env[tier.envVar]?.trim();
    if (!priceId) {
      console.error(
        `Missing ${tier.envVar}. Run: npm run stripe:create-products then paste the price_* lines into .env.local`,
      );
      hasError = true;
      continue;
    }

    if (!priceId.startsWith("price_")) {
      console.error(`${tier.envVar}=${priceId} does not look like a Stripe price id.`);
      hasError = true;
      continue;
    }

    let price: Stripe.Price;
    try {
      price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `Could not retrieve ${tier.envVar}=${priceId}:\n  ${msg}`,
      );
      if (/no such price/i.test(msg) || /resource_missing/i.test(msg)) {
        console.error(
          `  → This price id does not exist in the Stripe account for STRIPE_SECRET_KEY. Copy current price_* ids from Dashboard, or run: npm run stripe:create-products`,
        );
      }
      hasError = true;
      continue;
    }

    if (price.type !== "recurring") {
      console.warn(
        `Warning: ${tier.label} (${tier.interval}) price ${priceId} is not recurring (type=${price.type}).`,
      );
    }

    if (price.recurring?.interval !== tier.interval) {
      console.error(
        `${tier.label} ${priceId} recurring.interval=${price.recurring?.interval ?? "null"} — expected ${tier.interval}.`,
      );
      hasError = true;
    }

    if (price.unit_amount !== tier.amountPence) {
      const msg = `${tier.label} (${tier.interval}) ${priceId} unit_amount=${price.unit_amount ?? "null"} — expected ${tier.amountPence}. Create a new price_* at the correct amount and update ${tier.envVar}.`;
      console.error(msg);
      hasError = true;
    } else {
      console.log(
        `OK ${tier.label} (${tier.interval}) ${priceId} — unit_amount ${tier.amountPence} pence.`,
      );
    }

    const merged = mergeMetadata(price);
    const diff = needsUpdate(merged, tier.metadata);
    if (diff.length === 0) {
      console.log(
        `OK ${tier.label} (${tier.interval}) ${priceId} — metadata matches.`,
      );
      continue;
    }

    console.log(
      `${fix ? "Updating" : "MISMATCH"} ${tier.label} (${tier.interval}) ${priceId} — keys: ${diff.join(", ")}`,
    );
    if (!fix) {
      hasError = true;
      continue;
    }

    const next: Record<string, string> = { ...price.metadata, ...tier.metadata };
    await stripe.prices.update(priceId, { metadata: next });
    console.log(`  Applied metadata for ${priceId}.`);
  }

  const overageId = process.env.STRIPE_PRICE_AI_OVERAGE?.trim();
  if (overageId) {
    if (!overageId.startsWith("price_")) {
      console.warn(`STRIPE_PRICE_AI_OVERAGE=${overageId} is not a price_* id — skipping.`);
    } else {
      try {
        const p = await stripe.prices.retrieve(overageId, { expand: ["product"] });
        const m = p.metadata;
        if (m.purpose === "ai_overage") {
          console.log(
            `OK STRIPE_PRICE_AI_OVERAGE ${overageId} — metadata.purpose=ai_overage`,
          );
        } else {
          console.log(
            `STRIPE_PRICE_AI_OVERAGE ${overageId} — purpose=${m.purpose ?? "(unset)"} (optional: purpose=ai_overage per docs)`,
          );
          if (fix) {
            await stripe.prices.update(overageId, {
              metadata: { ...p.metadata, purpose: "ai_overage" },
            });
            console.log("  Set metadata[purpose]=ai_overage");
          }
        }
      } catch (e) {
        console.error("STRIPE_PRICE_AI_OVERAGE retrieve failed:", e);
        hasError = true;
      }
    }
  } else {
    console.log("(STRIPE_PRICE_AI_OVERAGE unset — optional metered overage line item)");
  }

  if (hasError && !fix) {
    console.error("\nRe-run with --fix to set Price metadata to match docs/stripe-pricing.md");
    process.exit(1);
  }
  if (hasError) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
