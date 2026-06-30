/**
 * Read-only Stripe pricing audit for Plott (monthly + annual licensed prices,
 * metadata, metered overage, active subscriptions).
 *
 *   npm run stripe:audit
 *   npx tsx scripts/audit-stripe-pricing.ts --json
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";
import { PLAN_CATALOG } from "./stripe-plan-catalog";
import {
  isMeteredOveragePrice,
  licensedSubscriptionItem,
  overageSubscriptionItem,
} from "../src/lib/stripe/subscription-items";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const METER_EVENT_NAME = "ai_overage";

type Finding = {
  level: "ok" | "warn" | "error";
  message: string;
};

function mergeMetadata(price: Stripe.Price): Record<string, string> {
  const p =
    typeof price.product === "object" && price.product && "metadata" in price.product
      ? (price.product as Stripe.Product).metadata
      : {};
  return { ...p, ...price.metadata };
}

async function findMeter(stripe: Stripe) {
  for await (const meter of stripe.billing.meters.list({ limit: 100 })) {
    if (meter.event_name === METER_EVENT_NAME) return meter;
  }
  return null;
}

async function main() {
  const asJson = process.argv.includes("--json");
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const findings: Finding[] = [];

  if (!key) {
    findings.push({ level: "error", message: "STRIPE_SECRET_KEY is not set." });
    output(findings, asJson);
    process.exit(1);
  }

  const stripe = new Stripe(key, { typescript: true });
  const account = await stripe.accounts.retrieve();
  findings.push({
    level: "ok",
    message: `Stripe account: ${account.id} (${account.settings?.dashboard?.display_name ?? "unnamed"})`,
  });

  for (const entry of PLAN_CATALOG) {
    const priceId = process.env[entry.envVar]?.trim();
    if (!priceId) {
      findings.push({
        level: "error",
        message: `Missing env ${entry.envVar}`,
      });
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
      if (price.unit_amount !== entry.amountPence) {
        findings.push({
          level: "error",
          message: `${entry.envVar}: unit_amount ${price.unit_amount} ≠ catalog ${entry.amountPence}`,
        });
      } else {
        findings.push({
          level: "ok",
          message: `${entry.envVar}: £${(entry.amountPence / 100).toFixed(2)}/${entry.interval} (${priceId})`,
        });
      }
      if (price.recurring?.interval !== entry.interval) {
        findings.push({
          level: "error",
          message: `${entry.envVar}: interval ${price.recurring?.interval} ≠ ${entry.interval}`,
        });
      }
      const merged = mergeMetadata(price);
      for (const [k, v] of Object.entries(entry.metadata)) {
        if (merged[k] !== v) {
          findings.push({
            level: "error",
            message: `${entry.envVar} metadata[${k}]: ${merged[k] ?? "(unset)"} ≠ ${v}`,
          });
        }
      }
    } catch (e) {
      findings.push({
        level: "error",
        message: `${entry.envVar} retrieve failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const meter = await findMeter(stripe);
  if (meter) {
    findings.push({
      level: "ok",
      message: `Billing meter ${meter.id} (event_name=${METER_EVENT_NAME})`,
    });
  } else {
    findings.push({
      level: "error",
      message: `No billing meter with event_name=${METER_EVENT_NAME}. Run npm run stripe:ensure-ai-meter`,
    });
  }

  const overageId = process.env.STRIPE_PRICE_AI_OVERAGE?.trim();
  if (!overageId) {
    findings.push({
      level: "warn",
      message: "STRIPE_PRICE_AI_OVERAGE unset — overage will not invoice.",
    });
  } else {
    try {
      const p = await stripe.prices.retrieve(overageId);
      if (!isMeteredOveragePrice(p)) {
        findings.push({
          level: "error",
          message: `STRIPE_PRICE_AI_OVERAGE ${overageId} is not a metered overage price`,
        });
      } else if (p.unit_amount !== 1 || p.currency !== "gbp") {
        findings.push({
          level: "error",
          message: `STRIPE_PRICE_AI_OVERAGE must be GBP unit_amount=1 (got ${p.currency} ${p.unit_amount})`,
        });
      } else {
        findings.push({
          level: "ok",
          message: `STRIPE_PRICE_AI_OVERAGE ${overageId} (1 unit = £0.01)`,
        });
      }
    } catch (e) {
      findings.push({
        level: "error",
        message: `STRIPE_PRICE_AI_OVERAGE retrieve failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const subs = await stripe.subscriptions.list({
    status: "all",
    limit: 100,
    expand: ["data.items.data.price"],
  });
  const active = subs.data.filter(
    (s) => s.status === "active" || s.status === "trialing",
  );
  findings.push({
    level: "ok",
    message: `Active/trialing subscriptions: ${active.length}`,
  });
  for (const sub of active) {
    const licensed = licensedSubscriptionItem(sub);
    const overage = overageSubscriptionItem(sub);
    const licensedId =
      licensed?.price && typeof licensed.price !== "string"
        ? licensed.price.id
        : "(unknown)";
    if (!licensed) {
      findings.push({
        level: "error",
        message: `Subscription ${sub.id}: no licensed line item`,
      });
    }
    if (!overage && overageId) {
      findings.push({
        level: "warn",
        message: `Subscription ${sub.id}: missing metered overage item (licensed=${licensedId})`,
      });
    } else if (overage) {
      findings.push({
        level: "ok",
        message: `Subscription ${sub.id}: licensed + overage items present`,
      });
    }
  }

  const hasError = findings.some((f) => f.level === "error");
  output(findings, asJson);
  process.exit(hasError ? 1 : 0);
}

function output(findings: Finding[], asJson: boolean) {
  if (asJson) {
    console.log(JSON.stringify({ findings }, null, 2));
    return;
  }
  console.log("\n# Plott Stripe pricing audit\n");
  for (const f of findings) {
    const icon = f.level === "ok" ? "OK" : f.level === "warn" ? "WARN" : "ERR";
    console.log(`[${icon}] ${f.message}`);
  }
  const errors = findings.filter((f) => f.level === "error").length;
  const warns = findings.filter((f) => f.level === "warn").length;
  console.log(`\nSummary: ${errors} error(s), ${warns} warning(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
