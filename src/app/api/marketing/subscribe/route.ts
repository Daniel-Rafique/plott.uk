import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { captureServerEvent } from "@/lib/posthog-server";
import {
  syncMarketingLeadToKlaviyo,
  trackKlaviyoEvent,
  upsertKlaviyoProfile,
  type KlaviyoMarketingResult,
  type KlaviyoMarketingSyncResult,
} from "@/lib/klaviyo-marketing";

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

async function safeCapture(event: string, distinctId: string, properties: Record<string, unknown>) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
  await captureServerEvent({ event, distinctId, properties });
}

function warnIfKlaviyoSkipped(
  result: KlaviyoMarketingResult | KlaviyoMarketingSyncResult,
  leadId: string,
  operation: string,
) {
  if (result.status !== "skipped") return;
  logger.warn(
    { reason: result.reason, leadId, operation },
    "marketing_lead_klaviyo_sync_skipped",
  );
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
    await safeCapture("marketing_lead_suppressed_submission", data.email, {
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

  await safeCapture("marketing_lead_submitted", data.email, {
    source: data.source,
    path: data.path,
    lead_magnet: data.leadMagnet,
    is_repeat: Boolean(existing),
  });

  try {
    const properties = {
      company: lead.company,
      lead_source: lead.source,
      lead_path: lead.path,
      lead_magnet: lead.leadMagnet,
      utm_source: lead.utmSource,
      utm_medium: lead.utmMedium,
      utm_campaign: lead.utmCampaign,
      utm_term: lead.utmTerm,
      utm_content: lead.utmContent,
      marketing_consent_text: lead.consentText,
      marketing_consented_at: lead.consentedAt.toISOString(),
      marketing_submission_count: lead.submissionCount,
    };
    const profile = await upsertKlaviyoProfile({
      email: lead.email,
      name: lead.name,
      company: lead.company,
      properties,
    });
    warnIfKlaviyoSkipped(profile, lead.id, "profile_upsert");

    const subscription = await syncMarketingLeadToKlaviyo({
      email: lead.email,
      source: lead.source,
      leadMagnet: lead.leadMagnet,
    });
    warnIfKlaviyoSkipped(subscription, lead.id, "list_subscription");

    const event = await trackKlaviyoEvent({
      email: lead.email,
      event: "Marketing Lead Submitted",
      uniqueId: `marketing-lead:${lead.id}:${lead.submissionCount}`,
      time: lead.lastSubmittedAt,
      properties,
    });
    warnIfKlaviyoSkipped(event, lead.id, "lead_event");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message, leadId: lead.id }, "marketing_lead_klaviyo_sync_failed");
  }

  return NextResponse.json({ ok: true, delivery: "klaviyo" });
}
