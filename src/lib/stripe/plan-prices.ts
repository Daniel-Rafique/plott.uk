export type PaidPlanId = "starter" | "pro" | "agency";
export type BillingInterval = "month" | "year";

export type PriceRequest = {
  priceId?: string;
  plan?: PaidPlanId;
  interval?: BillingInterval;
};

export type ResolvedPrice = { priceId: string | null; usedEnv: string };

const PLAN_ENV: Record<PaidPlanId, Record<BillingInterval, string>> = {
  starter: {
    month: "STRIPE_PRICE_STARTER",
    year: "STRIPE_PRICE_STARTER_ANNUAL",
  },
  pro: {
    month: "STRIPE_PRICE_PRO",
    year: "STRIPE_PRICE_PRO_ANNUAL",
  },
  agency: {
    month: "STRIPE_PRICE_AGENCY",
    year: "STRIPE_PRICE_AGENCY_ANNUAL",
  },
};

const ALL_ENV_KEYS = Object.values(PLAN_ENV).flatMap((m) => [
  m.month,
  m.year,
]);

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

export function normalizeBillingInterval(
  interval: unknown,
): BillingInterval {
  if (interval === "year" || interval === "annual") return "year";
  return "month";
}

export function configuredPriceIds(): Set<string> {
  return new Set(
    ALL_ENV_KEYS.map((envKey) => process.env[envKey])
      .filter((id): id is string => Boolean(id?.trim()))
      .map(sanitizePriceId),
  );
}

export function planForPriceId(priceId: string | undefined): PaidPlanId | null {
  if (!priceId?.trim().startsWith("price_")) return null;
  const clean = sanitizePriceId(priceId);
  for (const [plan, intervals] of Object.entries(PLAN_ENV)) {
    for (const envKey of Object.values(intervals)) {
      const configured = process.env[envKey];
      if (configured && sanitizePriceId(configured) === clean) {
        return plan as PaidPlanId;
      }
    }
  }
  return null;
}

export function billingIntervalForPriceId(
  priceId: string | undefined,
): BillingInterval | null {
  if (!priceId?.trim().startsWith("price_")) return null;
  const clean = sanitizePriceId(priceId);
  for (const intervals of Object.values(PLAN_ENV)) {
    const annual = process.env[intervals.year];
    if (annual && sanitizePriceId(annual) === clean) return "year";
    const monthly = process.env[intervals.month];
    if (monthly && sanitizePriceId(monthly) === clean) return "month";
  }
  return null;
}

export function paidPlanNextPath(
  plan: PaidPlanId,
  interval: BillingInterval = "month",
): string {
  const q = new URLSearchParams({ plan });
  if (interval === "year") q.set("interval", "year");
  return `/subscribe?${q.toString()}`;
}

export function resolvePriceId(body: PriceRequest): ResolvedPrice {
  const interval = normalizeBillingInterval(body.interval);
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
    return resolvePlanPriceId(body.plan, interval);
  }
  return { priceId: null, usedEnv: "body.plan" };
}

export function resolvePlanPriceId(
  plan: PaidPlanId,
  interval: BillingInterval = "month",
): ResolvedPrice {
  const envKey = PLAN_ENV[plan][interval];
  const raw = process.env[envKey];
  const id = raw?.trim();
  if (id) {
    return { priceId: sanitizePriceId(id), usedEnv: envKey };
  }
  return { priceId: null, usedEnv: envKey };
}

export function envKeyForPlan(
  plan: PaidPlanId,
  interval: BillingInterval,
): string {
  return PLAN_ENV[plan][interval];
}
