/**
 * Compliance preview endpoint. The UI posts letter content here before
 * sending/printing to surface any blockers or warnings the user should see.
 *
 * This mirrors the guardrail that `/api/letter/:id/status` enforces on send,
 * so users get the same verdict whether they preview or just try to send.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { runComplianceGuardrail } from "@/lib/ai/agents/compliance";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  subject: z.string().min(1).max(200),
  bodyHtml: z.string().min(10).max(40_000),
  recipientKind: z.enum(["applicant", "agent"]).optional(),
});

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await checkRateLimit("aiLetterAssist", ctx.company.id);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterMs);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await runComplianceGuardrail({
    ctx: { companyId: ctx.company.id, userId: ctx.user.id },
    subject: parsed.data.subject,
    bodyHtml: parsed.data.bodyHtml,
    recipientKind: parsed.data.recipientKind,
  });
  return NextResponse.json(result);
}
