import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { invalidateStripeMetaCache } from "@/lib/ai/tiers";
import {
  CheckoutSyncError,
  syncCheckoutSessionForCompany,
} from "@/lib/stripe/sync-checkout";

export const runtime = "nodejs";

type Body = { sessionId?: string };

/**
 * Fallback when the user returns from Checkout before the webhook is applied
 * (or the webhook is misconfigured). Reconciles the DB from the Checkout
 * Session — same as `checkout.session.completed` — after verifying the
 * session belongs to the signed-in user’s company.
 */
export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId?.startsWith("cs_")) {
    return NextResponse.json(
      { error: "sessionId (cs_...) is required" },
      { status: 400 },
    );
  }

  try {
    const synced = await syncCheckoutSessionForCompany({
      sessionId,
      companyId: ctx.company.id,
    });
    invalidateStripeMetaCache();
    return NextResponse.json({ ok: true, priceId: synced.priceId });
  } catch (e) {
    if (e instanceof CheckoutSyncError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logger.error(
      { err: e, sessionId, companyId: ctx.company.id },
      "stripe_sync_checkout_apply_failed",
    );
    return NextResponse.json(
      { error: "Could not sync checkout. Please try again." },
      { status: 502 },
    );
  }
}
