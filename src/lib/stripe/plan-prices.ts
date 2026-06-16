export type PaidPlanId = "starter" | "pro" | "agency";

export type PriceRequest = {
  priceId?: string;
  plan?: PaidPlanId;
};

export type ResolvedPrice = { priceId: string | null; usedEnv: string };

const PLAN_ENV: Record<PaidPlanId, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro: "STRIPE_PRICE_PRO",
  agency: "STRIPE_PRICE_AGENCY",
};

/** Trim + strip zero-width / BOM chars sometimes pasted from Dashboard or Slack. */
export function sanitizePriceId(id: string): string {
  return id.trim().replace(/[\u200b-\u200d\ufeff]/g, "");
}

export function normalizePlan(plan: unknown): PaidPlanId | null {
  if (typeof plan !== "string") return null;
  const p = plan.toLowerCase().trim();
  if (p === "starter" || p === "pro" || p === "agency") return p;
  return null;
}

export function configuredPriceIds(): Set<string> {
  return new Set(
    Object.values(PLAN_ENV)
      .map((envKey) => process.env[envKey])
      .filter((id): id is string => Boolean(id?.trim()))
      .map(sanitizePriceId),
  );
}

export function planForPriceId(priceId: string | undefined): PaidPlanId | null {
  if (!priceId?.trim().startsWith("price_")) return null;
  const clean = sanitizePriceId(priceId);
  for (const [plan, envKey] of Object.entries(PLAN_ENV)) {
    const configured = process.env[envKey];
    if (configured && sanitizePriceId(configured) === clean) {
      return plan as PaidPlanId;
    }
  }
  return null;
}

export function paidPlanNextPath(plan: PaidPlanId): string {
  return `/subscribe?plan=${encodeURIComponent(plan)}`;
}

export function resolvePriceId(body: PriceRequest): ResolvedPrice {
  if (body.priceId?.trim().startsWith("price_")) {
    const priceId = sanitizePriceId(body.priceId);
    if (!configuredPriceIds().has(priceId)) {
      return { priceId: null, usedEnv: "body.priceId" };
    }
    return {
      priceId,
      usedEnv: "body.priceId",
    };
  }
  if (body.plan && body.plan in PLAN_ENV) {
    return resolvePlanPriceId(body.plan);
  }
  return { priceId: null, usedEnv: "body.plan" };
}

export function resolvePlanPriceId(plan: PaidPlanId): ResolvedPrice {
  const envKey = PLAN_ENV[plan];
  const raw = process.env[envKey];
  const id = raw?.trim();
  if (id) {
    return { priceId: sanitizePriceId(id), usedEnv: envKey };
  }
  // Do not fall back to Pro when a tier was explicitly requested; that hid missing STRIPE_PRICE_AGENCY on Vercel/Preview.
  return { priceId: null, usedEnv: envKey };
}
