/**
 * Branded letter/email preview for pending AgentApprovals (before materialize).
 *
 * GET  — render saved draftJson
 * POST — render with optional body/subject overrides (live edit preview)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import {
  renderApprovalPreviewHtml,
  resolveSignatoryUser,
  type PreviewChannel,
} from "@/lib/outreach-preview";
import type { OutreachDraftDisplay } from "@/lib/outreach-draft-display";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const channelSchema = z.enum(["letter", "email"]);

const postBodySchema = z.object({
  letterBodyHtml: z.string().optional(),
  emailBodyHtml: z.string().optional(),
  emailSubject: z.string().max(140).optional(),
  subject: z.string().max(140).optional(),
});

function parseChannel(req: Request): PreviewChannel | null {
  const url = new URL(req.url);
  const parsed = channelSchema.safeParse(url.searchParams.get("channel"));
  return parsed.success ? parsed.data : null;
}

async function renderPreview(
  req: Request,
  context: Ctx,
  overrides?: z.infer<typeof postBodySchema>,
) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canUseAutoOutreach) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const channel = parseChannel(req);
  if (!channel) {
    return NextResponse.json(
      { error: "Query param channel=letter|email required" },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const approval = await prisma.agentApproval.findUnique({ where: { id } });
  if (!approval || approval.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await resolveSignatoryUser({
    companyId: ctx.company.id,
    preferredUserId: ctx.user.id,
  });
  if (!user) {
    return NextResponse.json(
      { error: "No signatory user found for preview" },
      { status: 422 },
    );
  }

  const draft = approval.draftJson as OutreachDraftDisplay;
  const html = renderApprovalPreviewHtml({
    channel,
    approval,
    draft,
    company: ctx.company,
    user,
    overrides,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(req: Request, context: Ctx) {
  return renderPreview(req, context);
}

export async function POST(req: Request, context: Ctx) {
  const body = postBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: body.error.flatten() },
      { status: 400 },
    );
  }
  return renderPreview(req, context, body.data);
}
