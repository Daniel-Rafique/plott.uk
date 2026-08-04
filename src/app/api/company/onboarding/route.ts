/**
 * Onboarding wizard target. Updates the auto-created Company row with the
 * details the user typed in, then stamps `onboardingCompletedAt` so the
 * `resolveStage()` gate stops routing them back to `/onboarding`.
 *
 * Logo is uploaded separately through `/api/company/logo-upload` (server-side
 * FormData → @vercel/blob put with `access: "private"`), which writes
 * `logoBlobUrl`/`logoBlobPathname` directly on the Company row — the wizard
 * just triggers that flow and then POSTs here to finalise.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext, hasActiveSubscription } from "@/lib/tenant";
import {
  optionalTrimmedString,
  optionalWebsiteUrlSchema,
} from "@/lib/auth/form-validation";
import { trackKlaviyoEvent, upsertKlaviyoProfile } from "@/lib/klaviyo-marketing";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  websiteUrl: optionalWebsiteUrlSchema,
  addressLines: optionalTrimmedString(500),
  phone: optionalTrimmedString(40),
});

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const first =
      flat.fieldErrors.name?.[0] ??
      flat.fieldErrors.websiteUrl?.[0] ??
      flat.fieldErrors.addressLines?.[0] ??
      flat.fieldErrors.phone?.[0] ??
      flat.formErrors[0] ??
      "Invalid fields";
    return NextResponse.json(
      { error: first, issues: flat },
      { status: 400 },
    );
  }
  const { name, websiteUrl, addressLines, phone } = parsed.data;

  const alreadyOnboarded = Boolean(ctx.company.onboardingCompletedAt);
  const company = await prisma.company.update({
    where: { id: ctx.company.id },
    data: {
      name,
      websiteUrl: websiteUrl ?? null,
      addressLines: addressLines ?? null,
      phone: phone ?? null,
      onboardingCompletedAt: new Date(),
    },
  });

  const subscribed = hasActiveSubscription(company);
  const nextPath = subscribed ? "/app/dashboard" : "/subscribe";

  // Trigger for Klaviyo "finished signup / didn't pay" flow. Skip re-fires when
  // the wizard is re-saved after onboarding was already stamped.
  if (!alreadyOnboarded && !subscribed && ctx.user.email) {
    try {
      const profile = await upsertKlaviyoProfile({
        email: ctx.user.email,
        name: ctx.user.name,
        company: company.name,
        properties: {
          company_id: company.id,
          company_name: company.name,
          funnel_stage: "needs_plan",
          has_paid: false,
          website_url: company.websiteUrl,
        },
      });
      if (profile.status === "skipped") {
        logger.warn(
          { reason: profile.reason, companyId: company.id },
          "klaviyo_onboarding_completed_skipped",
        );
      }

      const event = await trackKlaviyoEvent({
        email: ctx.user.email,
        event: "Onboarding Completed",
        uniqueId: `onboarding-completed:${company.id}`,
        properties: {
          company_id: company.id,
          company_name: company.name,
          funnel_stage: "needs_plan",
          has_paid: false,
          next_path: nextPath,
          website_url: company.websiteUrl,
        },
      });
      if (event.status === "skipped") {
        logger.warn(
          { reason: event.reason, companyId: company.id },
          "klaviyo_onboarding_completed_skipped",
        );
      }
    } catch (err) {
      logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          companyId: company.id,
        },
        "klaviyo_onboarding_completed_failed",
      );
    }
  }

  return NextResponse.json({
    ok: true,
    nextPath,
  });
}
