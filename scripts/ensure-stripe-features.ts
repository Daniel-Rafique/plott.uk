/**
 * Ensure Stripe Entitlements Features exist and are attached to plan products.
 * Documentation/catalog only — the Plott app gates access via Price metadata +
 * src/lib/plan-features.ts, not Stripe entitlements API responses.
 *
 *   npm run stripe:ensure-features
 *   npm run stripe:ensure-features -- --fix
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";
import { STRIPE_FEATURE_CATALOG } from "./stripe-feature-catalog";
import type { PlanId } from "./stripe-plan-catalog";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const PLAN_PRICE_ENV: Record<PlanId, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro: "STRIPE_PRICE_PRO",
  agency: "STRIPE_PRICE_AGENCY",
};

type FeatureRecord = {
  id: string;
  lookup_key: string;
  name: string;
};

async function stripeRequest<T>(
  stripe: Stripe,
  method: string,
  path: string,
  body?: Record<string, string>,
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");

  const params = body ? new URLSearchParams(body) : undefined;
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params?.toString(),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Stripe ${method} ${path} failed`);
  }
  return json;
}

async function listFeatures(stripe: Stripe): Promise<FeatureRecord[]> {
  const out: FeatureRecord[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const qs = new URLSearchParams({ limit: "100" });
    if (startingAfter) qs.set("starting_after", startingAfter);
    const page = await stripeRequest<{
      data: FeatureRecord[];
      has_more: boolean;
    }>(stripe, "GET", `/v1/entitlements/features?${qs.toString()}`);
    out.push(...page.data);
    if (!page.has_more || !page.data.length) break;
    startingAfter = page.data[page.data.length - 1]?.id;
  }
  return out;
}

async function createFeature(
  stripe: Stripe,
  def: { lookupKey: string; name: string },
): Promise<FeatureRecord> {
  return stripeRequest<FeatureRecord>(stripe, "POST", "/v1/entitlements/features", {
    lookup_key: def.lookupKey,
    name: def.name,
  });
}

async function listProductFeatures(
  stripe: Stripe,
  productId: string,
): Promise<Array<{ id: string; entitlement_feature: FeatureRecord }>> {
  const page = await stripeRequest<{
    data: Array<{ id: string; entitlement_feature: FeatureRecord }>;
  }>(stripe, "GET", `/v1/products/${productId}/features?limit=100`);
  return page.data;
}

async function attachFeature(
  stripe: Stripe,
  productId: string,
  featureId: string,
): Promise<void> {
  await stripeRequest(
    stripe,
    "POST",
    `/v1/products/${productId}/features`,
    { entitlement_feature: featureId },
  );
}

async function productIdForPlan(
  stripe: Stripe,
  planId: PlanId,
): Promise<string | null> {
  const priceId = process.env[PLAN_PRICE_ENV[planId]]?.trim();
  if (!priceId) return null;
  const price = await stripe.prices.retrieve(priceId);
  return typeof price.product === "string" ? price.product : price.product?.id ?? null;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set.");
    process.exit(1);
  }

  const stripe = new Stripe(key, { typescript: true });
  let existing = await listFeatures(stripe);
  const byLookup = new Map(existing.map((f) => [f.lookup_key, f]));

  for (const def of STRIPE_FEATURE_CATALOG) {
    if (!byLookup.has(def.lookupKey)) {
      if (!fix) {
        console.log(`MISSING feature: ${def.lookupKey} (${def.name})`);
        continue;
      }
      const created = await createFeature(stripe, def);
      byLookup.set(def.lookupKey, created);
      existing = [...existing, created];
      console.log(`CREATED feature ${def.lookupKey} → ${created.id}`);
    } else {
      console.log(`OK feature: ${def.lookupKey}`);
    }
  }

  const productByPlan = new Map<PlanId, string>();
  for (const planId of ["starter", "pro", "agency"] as PlanId[]) {
    const productId = await productIdForPlan(stripe, planId);
    if (!productId) {
      console.warn(`SKIP ${planId}: set ${PLAN_PRICE_ENV[planId]} to resolve product`);
      continue;
    }
    productByPlan.set(planId, productId);
  }

  for (const def of STRIPE_FEATURE_CATALOG) {
    const feature = byLookup.get(def.lookupKey);
    if (!feature) continue;

    for (const planId of def.planIds) {
      const productId = productByPlan.get(planId);
      if (!productId) continue;

      const attached = await listProductFeatures(stripe, productId);
      const hasFeature = attached.some(
        (row) => row.entitlement_feature.lookup_key === def.lookupKey,
      );
      if (hasFeature) {
        console.log(`OK product feature: ${planId} ← ${def.lookupKey}`);
        continue;
      }
      if (!fix) {
        console.log(`MISSING product feature: ${planId} ← ${def.lookupKey}`);
        continue;
      }
      await attachFeature(stripe, productId, feature.id);
      console.log(`ATTACHED ${def.lookupKey} to ${planId} (${productId})`);
    }
  }

  if (!fix) {
    console.log("\nRe-run with --fix to create missing features and product attachments.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
