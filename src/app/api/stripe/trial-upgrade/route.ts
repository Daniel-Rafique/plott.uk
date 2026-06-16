import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { normalizePlan } from "@/lib/stripe/plan-prices";
import {
  TrialUpgradeError,
  updateTrialSubscriptionPlan,
} from "@/lib/stripe/trial-upgrade";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { plan?: unknown } = {};
  try {
    body = (await req.json()) as { plan?: unknown };
  } catch {
    // handled by plan validation below
  }

  const plan = normalizePlan(body.plan);
  if (!plan) {
    return NextResponse.json({ error: "Choose a valid plan." }, { status: 400 });
  }

  try {
    const subscription = await updateTrialSubscriptionPlan({
      company: ctx.company,
      plan,
    });

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } catch (err) {
    if (err instanceof TrialUpgradeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error(
      { err, companyId: ctx.company.id, plan },
      "stripe_trial_upgrade_failed",
    );
    return NextResponse.json(
      { error: "Could not update trial subscription." },
      { status: 502 },
    );
  }
}
