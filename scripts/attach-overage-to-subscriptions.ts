/**
 * Attaches STRIPE_PRICE_AI_OVERAGE to active subscriptions missing the metered item.
 *
 *   npx tsx scripts/attach-overage-to-subscriptions.ts
 *   npx tsx scripts/attach-overage-to-subscriptions.ts --dry-run
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";
import {
  licensedSubscriptionItem,
  overageSubscriptionItem,
} from "../src/lib/stripe/subscription-items";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const overagePriceId = process.env.STRIPE_PRICE_AI_OVERAGE?.trim();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set.");
    process.exit(1);
  }
  if (!overagePriceId?.startsWith("price_")) {
    console.error("STRIPE_PRICE_AI_OVERAGE must be a price_* id.");
    process.exit(1);
  }

  const stripe = new Stripe(key, { typescript: true });
  const subs = await stripe.subscriptions.list({
    status: "all",
    limit: 100,
    expand: ["data.items.data.price"],
  });

  let attached = 0;
  for (const sub of subs.data) {
    if (sub.status !== "active" && sub.status !== "trialing") continue;
    if (!licensedSubscriptionItem(sub)) continue;
    if (overageSubscriptionItem(sub)) {
      console.log(`OK ${sub.id} — overage item already present`);
      continue;
    }
    console.log(
      `${dryRun ? "Would attach" : "Attaching"} overage to subscription ${sub.id}`,
    );
    if (!dryRun) {
      await stripe.subscriptionItems.create({
        subscription: sub.id,
        price: overagePriceId,
      });
    }
    attached += 1;
  }
  console.log(`\nDone. ${attached} subscription(s) ${dryRun ? "would be" : ""} updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
