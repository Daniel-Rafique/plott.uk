/**
 * Maps Stripe subscription tiers to AI entitlements. Derived at request time
 * from `Company.subscriptionPriceId` — we deliberately don't persist the tier
 * name since Stripe is the source of truth for billing state.
 *
 * Tier ladder (entitlement increases monotonically):
 *   free    → pay-as-you-go, no AI features
 *   starter → basic AI: NL search, digest summaries, Q&A chat, compliance
 *   pro     → everything in starter + letter assist, enrichment agent,
 *             research briefings, ICP classifier
 *   agency  → everything in pro + autonomous outreach pipeline
 *
 * Monthly budget caps define the included AI allowance per plan. Usage beyond
 * the cap is metered via Stripe and invoiced at `ai_overage_rate` (default 4x)
 * at the end of the billing cycle. Users are never blocked for budget
 * exhaustion — only the daily safety guard (guardrails.ts) can stop a run.
 */

import type { AgentKind } from "@/lib/ai/router";
import type { Company } from "@prisma/client";
import { logger } from "@/lib/logger";
import { configuredPriceIds, planForPriceId } from "@/lib/stripe/plan-prices";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";

export type Tier = "free" | "starter" | "pro" | "agency";

type TierDef = {
  id: Tier;
  label: string;
  allowedKinds: Set<AgentKind>;
  /** Hard monthly ceiling (GBP) regardless of per-tenant daily budget. */
  monthlyBudgetCapGbp: number;
};

/**
 * Stripe Price metadata overrides, cached per-process.
 * Keys we read from `price.metadata`:
 *   - `ai_monthly_budget_gbp`  (number)
 *   - `saved_search_limit`     (number)
 *   - `ai_overage_rate`        (number, multiplier for overage billing)
 *
 * Populated lazily on first call to `loadStripeMetadata()`.
 */
type StripeMetadataOverrides = {
  monthlyBudgetCapGbp?: number;
  savedSearchLimit?: number;
  aiOverageRate?: number;
};
let stripeMetaCache: Map<string, StripeMetadataOverrides> | null = null;
let stripeMetaLoading: Promise<Map<string, StripeMetadataOverrides>> | null = null;

async function loadStripeMetadata(): Promise<Map<string, StripeMetadataOverrides>> {
  if (stripeMetaCache) return stripeMetaCache;
  if (stripeMetaLoading) return stripeMetaLoading;
  stripeMetaLoading = (async () => {
    const map = new Map<string, StripeMetadataOverrides>();
    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      stripeMetaCache = map;
      stripeMetaLoading = null;
      return map;
    }
    try {
      const { getStripe } = await import("@/lib/stripe");
      const stripe = getStripe();
      const priceIds = (
        ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_PRO", "STRIPE_PRICE_AGENCY"] as const
      )
        .map((k) => process.env[k])
        .filter((v): v is string => Boolean(v));

      const prices = await Promise.all(
        priceIds.map((id) => stripe.prices.retrieve(id, { expand: ["product"] }).catch(() => null)),
      );
      for (const p of prices) {
        if (!p) continue;
        const meta = {
          ...(typeof p.product === "object" && p.product && "metadata" in p.product
            ? p.product.metadata
            : {}),
          ...p.metadata,
        };
        const overrides: StripeMetadataOverrides = {};
        if (meta.ai_monthly_budget_gbp) {
          const n = Number(meta.ai_monthly_budget_gbp);
          if (!Number.isNaN(n) && n >= 0) overrides.monthlyBudgetCapGbp = n;
        }
        if (meta.saved_search_limit) {
          const n = Number(meta.saved_search_limit);
          if (!Number.isNaN(n) && n >= 0) overrides.savedSearchLimit = n;
        }
        if (meta.ai_overage_rate) {
          const n = Number(meta.ai_overage_rate);
          if (!Number.isNaN(n) && n > 0) overrides.aiOverageRate = n;
        }
        if (Object.keys(overrides).length > 0) {
          map.set(p.id, overrides);
        }
      }
    } catch (err) {
      logger.warn({ err }, "stripe_metadata_fetch_failed — using hardcoded fallbacks");
    }
    stripeMetaCache = map;
    stripeMetaLoading = null;
    return map;
  })();
  return stripeMetaLoading;
}

/**
 * Get Stripe metadata overrides for a given price ID.
 * Returns undefined values when no metadata is set (caller uses hardcoded fallback).
 */
export async function getStripeMeta(priceId: string | null): Promise<StripeMetadataOverrides> {
  if (!priceId) return {};
  const map = await loadStripeMetadata();
  return map.get(priceId) ?? {};
}

/** Invalidate cached Stripe metadata (e.g. after webhook). */
export function invalidateStripeMetaCache(): void {
  stripeMetaCache = null;
  stripeMetaLoading = null;
}

const FREE_KINDS = new Set<AgentKind>();

const STARTER_KINDS = new Set<AgentKind>([
  "nl_search",
  "digest_summary",
  "planning_qa",
  "compliance_guardrail",
]);

const PRO_KINDS = new Set<AgentKind>([
  ...STARTER_KINDS,
  "letter_assist",
  "enrichment_agent",
  "applicant_research",
  "icp_classifier",
]);

const AGENCY_KINDS = new Set<AgentKind>([
  ...PRO_KINDS,
  "outreach_drafter",
  "appeal_classifier",
  "appeal_pitch_drafter",
]);

const TIERS: Record<Tier, TierDef> = {
  free: {
    id: "free",
    label: "Free",
    allowedKinds: FREE_KINDS,
    monthlyBudgetCapGbp: 0,
  },
  starter: {
    id: "starter",
    label: "Starter",
    allowedKinds: STARTER_KINDS,
    monthlyBudgetCapGbp: 25,
  },
  pro: {
    id: "pro",
    label: "Pro",
    allowedKinds: PRO_KINDS,
    monthlyBudgetCapGbp: 100,
  },
  agency: {
    id: "agency",
    label: "Agency",
    allowedKinds: AGENCY_KINDS,
    monthlyBudgetCapGbp: 500,
  },
};

/**
 * Track which (companyId, priceId) pairs we've already warned about so we don't
 * flood logs on every request. Cleared naturally when the process recycles.
 */
const unmappedPriceIdWarned = new Set<string>();

export function getCompanyTier(
  company: Pick<Company, "id" | "subscriptionPriceId" | "subscriptionStatus"> &
    Partial<Pick<Company, "subscriptionCurrentPeriodEnd" | "trialEndsAt">>,
): Tier {
  if (process.env.AI_TIER_OVERRIDE) {
    const t = process.env.AI_TIER_OVERRIDE.toLowerCase() as Tier;
    if (TIERS[t]) return t;
  }
  if (!hasSubscriptionAccess(company)) return "free";
  if (!company.subscriptionPriceId) return "free";
  const mapped = planForPriceId(company.subscriptionPriceId);
  if (mapped) return mapped;
  // Active subscription on a priceId we don't recognise — almost always a
  // STRIPE_PRICE_* env var that's missing or pointing at the wrong Stripe
  // account. Surface it loudly (once per process per pair) so ops can fix the
  // env instead of the user hitting a confusing "current: Free" error.
  const warnKey = `${company.id}:${company.subscriptionPriceId}`;
  if (!unmappedPriceIdWarned.has(warnKey)) {
    unmappedPriceIdWarned.add(warnKey);
    logger.warn(
      {
        companyId: company.id,
        priceId: company.subscriptionPriceId,
        subscriptionStatus: company.subscriptionStatus,
        configuredPriceIds: Array.from(configuredPriceIds()),
      },
      "tier_resolver_unmapped_price_id",
    );
  }
  return "free";
}

export function tierDef(tier: Tier): TierDef {
  return TIERS[tier];
}

/** Default monthly AI budget cap (GBP) for paid plan IDs; aligns marketing `loadPlans` fallbacks. */
export function defaultMonthlyBudgetCapGbp(
  planId: "starter" | "pro" | "agency",
): number {
  return TIERS[planId].monthlyBudgetCapGbp;
}

/**
 * Async version of `tierDef` that resolves Stripe metadata overrides.
 * Falls back to the hardcoded `TIERS` definition when metadata is missing.
 */
export async function tierDefWithStripe(
  tier: Tier,
  priceId: string | null,
): Promise<TierDef> {
  const base = TIERS[tier];
  const meta = await getStripeMeta(priceId);
  return {
    ...base,
    monthlyBudgetCapGbp: meta.monthlyBudgetCapGbp ?? base.monthlyBudgetCapGbp,
  };
}

export function isAgentKindAllowed(tier: Tier, kind: AgentKind): boolean {
  return TIERS[tier].allowedKinds.has(kind);
}

export function upgradeRequiredForKind(kind: AgentKind): Tier | null {
  for (const t of ["starter", "pro", "agency"] as const) {
    if (TIERS[t].allowedKinds.has(kind)) return t;
  }
  return null;
}

export class AgentTierError extends Error {
  constructor(
    public readonly kind: AgentKind,
    public readonly currentTier: Tier,
    public readonly requiredTier: Tier,
  ) {
    super(
      `The ${kind} agent requires the ${TIERS[requiredTier].label} plan (current: ${TIERS[currentTier].label}).`,
    );
    this.name = "AgentTierError";
  }
}
