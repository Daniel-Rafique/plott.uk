import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sendContactSubmissionEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const bodySchema = z.object({
  source: z.enum(["contact", "support"]).default("contact"),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Valid email required").max(200),
  company: z.string().trim().max(160).optional().nullable(),
  message: z.string().trim().min(10, "Tell us a little more").max(4000),
  // Honeypot — bots fill it, humans never see it.
  website: z.string().max(0).optional().or(z.literal("")),
});

function clientIp(req: Request): string {
  const fwd =
    req.headers.get("x-vercel-forwarded-for") ??
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "";
  const first = fwd.split(",")[0]?.trim();
  return first || "unknown";
}

export async function POST(req: Request) {
  const ip = clientIp(req);

  const rl = await checkRateLimit("contact", ip);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid submission", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Silently drop honeypot hits so bots don't learn we rejected them.
  if (parsed.data.website) {
    return NextResponse.json({ ok: true });
  }

  try {
    await sendContactSubmissionEmail({
      source: parsed.data.source,
      fromName: parsed.data.name,
      fromEmail: parsed.data.email,
      company: parsed.data.company ?? null,
      message: parsed.data.message,
      ip,
      userAgent: req.headers.get("user-agent"),
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "contact_form_send_failed",
    );
    return NextResponse.json(
      { error: "Could not send your message right now. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
