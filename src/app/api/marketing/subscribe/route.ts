import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getPostHogClient } from "@/lib/posthog-server";
import {
  sendMarketingLeadSuccessEmail,
  syncMarketingLeadToResend,
} from "@/lib/resend-marketing";

export const runtime = "nodejs";

const CONSENT_TEXT =
  "I agree to receive Plott planning lead resources, product updates and marketing emails. I can unsubscribe at any time.";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(120).optional().nullable(),
  company: z.string().trim().max(160).optional().nullable(),
  source: z.string().trim().min(1).max(80).default("marketing_capture"),
  path: z.string().trim().max(500).optional().nullable(),
  leadMagnet: z.string().trim().max(120).optional().nullable(),
  consentAccepted: z.boolean(),
  website: z.string().max(0).optional().or(z.literal("")),
  utm: z
    .object({
      source: z.string().trim().max(120).optional().nullable(),
      medium: z.string().trim().max(120).optional().nullable(),
      campaign: z.string().trim().max(160).optional().nullable(),
      term: z.string().trim().max(160).optional().nullable(),
      content: z.string().trim().max(160).optional().nullable(),
    })
    .optional()
    .nullable(),
});

function clientIp(req: Request): string {
  const forwarded =
    req.headers.get("x-vercel-forwarded-for") ??
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function hashAuditValue(value: string | null | undefined) {
  if (!value) return null;
  const salt = process.env.MARKETING_LEAD_HASH_SALT ?? "plott-marketing-leads";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function safeCapture(event: string, distinctId: string, properties: Record<string, unknown>) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
  try {
    getPostHogClient().capture({
      event,
      distinctId,
      properties,
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), event },
      "posthog_marketing_capture_failed",
    );
  }
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rate = await checkRateLimit("marketingSubscribe", ip);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterMs);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid subscription", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.website) {
    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.consentAccepted) {
    return NextResponse.json(
      { error: "Marketing consent is required." },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const userAgent = req.headers.get("user-agent");
  const now = new Date();
  const existing = await prisma.marketingLead.findUnique({
    where: { email: data.email },
  });

  if (existing?.suppressedAt) {
    safeCapture("marketing_lead_suppressed_submission", data.email, {
      source: data.source,
      path: data.path,
      lead_magnet: data.leadMagnet,
    });
    return NextResponse.json({ ok: true });
  }

  const lead = existing
    ? await prisma.marketingLead.update({
        where: { email: data.email },
        data: {
          name: data.name || existing.name,
          company: data.company || existing.company,
          source: data.source,
          path: data.path,
          leadMagnet: data.leadMagnet,
          utmSource: data.utm?.source ?? null,
          utmMedium: data.utm?.medium ?? null,
          utmCampaign: data.utm?.campaign ?? null,
          utmTerm: data.utm?.term ?? null,
          utmContent: data.utm?.content ?? null,
          consentText: CONSENT_TEXT,
          consentedAt: now,
          ipHash: hashAuditValue(ip),
          userAgentHash: hashAuditValue(userAgent),
          unsubscribedAt: null,
          lastSubmittedAt: now,
          submissionCount: { increment: 1 },
          resendSyncError: null,
        },
      })
    : await prisma.marketingLead.create({
        data: {
          email: data.email,
          name: data.name || null,
          company: data.company || null,
          source: data.source,
          path: data.path,
          leadMagnet: data.leadMagnet,
          utmSource: data.utm?.source ?? null,
          utmMedium: data.utm?.medium ?? null,
          utmCampaign: data.utm?.campaign ?? null,
          utmTerm: data.utm?.term ?? null,
          utmContent: data.utm?.content ?? null,
          consentText: CONSENT_TEXT,
          consentedAt: now,
          ipHash: hashAuditValue(ip),
          userAgentHash: hashAuditValue(userAgent),
        },
      });

  safeCapture("marketing_lead_submitted", data.email, {
    source: data.source,
    path: data.path,
    lead_magnet: data.leadMagnet,
    is_repeat: Boolean(existing),
  });

  try {
    const sync = await syncMarketingLeadToResend({
      email: lead.email,
      name: lead.name,
      company: lead.company,
      source: lead.source,
      path: lead.path,
      leadMagnet: lead.leadMagnet,
    });

    await prisma.marketingLead.update({
      where: { id: lead.id },
      data:
        sync.status === "synced"
          ? {
              resendAudienceId: sync.audienceId,
              resendContactId: sync.contactId,
              resendSyncedAt: new Date(),
              resendSyncError: null,
            }
          : {
              resendSyncError: sync.reason,
            },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message, leadId: lead.id }, "marketing_lead_resend_sync_failed");
    await prisma.marketingLead.update({
      where: { id: lead.id },
      data: { resendSyncError: message.slice(0, 500) },
    });
  }

  let successEmailSent = false;
  try {
    const successEmail = await sendMarketingLeadSuccessEmail({
      email: lead.email,
      leadMagnet: lead.leadMagnet,
    });
    successEmailSent = !("skipped" in successEmail);
    if ("skipped" in successEmail) {
      logger.warn(
        { reason: successEmail.reason, leadId: lead.id },
        "marketing_lead_success_email_skipped",
      );
    }
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        leadId: lead.id,
      },
      "marketing_lead_success_email_failed",
    );
  }

  return NextResponse.json({ ok: true, successEmailSent });
}
