/**
 * Thin server-side helper for AI route handlers. Returns the current tenant's
 * tier entitlement for a given agent kind and a prebuilt 402 response if the
 * tier is insufficient. Routes call it before expensive streaming starts so
 * the user gets a fast, actionable error.
 *
 * Monthly budget is no longer a hard block — overages beyond the included
 * budget are metered via Stripe and invoiced at the end of the billing cycle.
 *
 * Example usage:
 *   const gate = await requireAiEntitlement(ctx, "letter_assist");
 *   if (!gate.ok) return gate.response;
 */

import { NextResponse } from "next/server";
import type { Company } from "@prisma/client";
import type { AgentKind } from "@/lib/ai/router";
import {
  getCompanyTier,
  isAgentKindAllowed,
  tierDef,
  upgradeRequiredForKind,
  type Tier,
} from "@/lib/ai/tiers";
import { repairSubscriptionStateForEntitlements } from "@/lib/stripe/subscription-repair";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";

type Ctx = {
  company: Pick<
    Company,
    | "id"
    | "subscriptionStatus"
    | "subscriptionPriceId"
    | "subscriptionCurrentPeriodEnd"
    | "trialEndsAt"
    | "aiEnabled"
  >;
};

export type EntitlementResult =
  | { ok: true; tier: Tier }
  | { ok: false; response: NextResponse };

export async function requireAiEntitlement(
  ctx: Ctx,
  kind: AgentKind,
): Promise<EntitlementResult> {
  if (!hasSubscriptionAccess(ctx.company)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "An active subscription is required for AI features.",
          code: "subscription_required",
        },
        { status: 403 },
      ),
    };
  }
  if (!ctx.company.aiEnabled) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "AI features are disabled for this workspace.",
          code: "ai_disabled",
        },
        { status: 403 },
      ),
    };
  }

  let tier = getCompanyTier(ctx.company);
  if (
    tier === "free" &&
    (ctx.company.subscriptionStatus === "active" ||
      ctx.company.subscriptionStatus === "trialing")
  ) {
    const repaired = await repairSubscriptionStateForEntitlements(ctx.company.id);
    if (repaired) {
      tier = getCompanyTier({ ...ctx.company, ...repaired });
    }
  }
  if (!isAgentKindAllowed(tier, kind)) {
    const required = upgradeRequiredForKind(kind) ?? "pro";
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `This feature requires the ${tierDef(required).label} plan. You're on ${tierDef(tier).label}.`,
          code: "tier_required",
          upgradeTo: required,
          currentTier: tier,
        },
        { status: 402 },
      ),
    };
  }

  return { ok: true, tier };
}
