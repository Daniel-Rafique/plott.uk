import type Stripe from "stripe";
import { sendSubscriptionWelcomeEmail } from "@/lib/email";
import { trackKlaviyoEvent, upsertKlaviyoProfile } from "@/lib/klaviyo-marketing";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

function firstPriceId(sub: Stripe.Subscription): string | null {
  const item = sub.items.data[0];
  if (!item) return null;
  if (typeof item.price === "string") return item.price;
  return item.price?.id ?? null;
}

/**
 * Idempotent: sends at most one welcome email per company, after a completed
 * subscription checkout (webhook and/or sync). Claim row before send; clear on
 * failure so a retry can try again.
 */
export async function trySendSubscriptionWelcomeEmail(
  companyId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const owner = await prisma.membership.findFirst({
    where: { companyId, role: "owner" },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const to = owner?.user?.email;
  if (!to) {
    logger.warn(
      { companyId },
      "subscription_welcome_no_owner_email",
    );
    return;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, subscriptionWelcomeEmailSentAt: true },
  });
  if (!company?.name || company.subscriptionWelcomeEmailSentAt) return;

  const claim = await prisma.company.updateMany({
    where: { id: companyId, subscriptionWelcomeEmailSentAt: null },
    data: { subscriptionWelcomeEmailSentAt: new Date() },
  });
  if (claim.count === 0) return;

  const trialEndSec = sub.trial_end;
  const trialEndsAt = trialEndSec
    ? new Date(trialEndSec * 1000)
    : null;
  const inTrialWindow =
    typeof trialEndSec === "number" && trialEndSec * 1000 > Date.now();
  const isTrialing =
    sub.status === "trialing" || (sub.status === "active" && inTrialWindow);
  const lifecycleEvent = isTrialing ? "Trial Started" : "Subscription Started";

  try {
    const profile = await upsertKlaviyoProfile({
      email: to,
      company: company.name,
      properties: {
        company_id: companyId,
        company_name: company.name,
        subscription_status: sub.status,
        subscription_price_id: firstPriceId(sub),
        trial_ends_at: trialEndsAt?.toISOString() ?? null,
      },
    });
    if (profile.status === "skipped") {
      logger.warn(
        { reason: profile.reason, companyId, operation: "profile_upsert" },
        "klaviyo_subscription_lifecycle_skipped",
      );
    }

    const event = await trackKlaviyoEvent({
      email: to,
      event: lifecycleEvent,
      uniqueId: `${lifecycleEvent}:${companyId}:${sub.id}`,
      properties: {
        company_id: companyId,
        company_name: company.name,
        stripe_subscription_id: sub.id,
        subscription_status: sub.status,
        subscription_price_id: firstPriceId(sub),
        trial_ends_at: trialEndsAt?.toISOString() ?? null,
      },
    });
    if (event.status === "skipped") {
      logger.warn(
        { reason: event.reason, companyId, operation: "lifecycle_event" },
        "klaviyo_subscription_lifecycle_skipped",
      );
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), companyId },
      "klaviyo_subscription_lifecycle_failed",
    );
  }

  try {
    await sendSubscriptionWelcomeEmail({
      to,
      companyName: company.name,
      isTrialing,
      trialEndsAt,
    });
  } catch (err) {
    await prisma.company
      .update({
        where: { id: companyId },
        data: { subscriptionWelcomeEmailSentAt: null },
      })
      .catch(() => {});
    logger.error(
      { err, companyId },
      "subscription_welcome_send_failed",
    );
  }
}
