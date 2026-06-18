/**
 * Approve/reject an AgentApproval. Reviewers can materialize a printable
 * Letter draft or, when the workspace explicitly opts in, send the approved
 * draft by email after an email-channel compliance check.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { planningEntityToNumber } from "@/lib/planning-entity-bigint";
import {
  ApprovalMaterializationError,
  materializeApprovalLetter,
} from "@/lib/agent-approvals";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import { scheduleLetterPdfEmailDelivery } from "@/lib/letter-delivery";
import { runComplianceGuardrail } from "@/lib/ai/agents/compliance";
import { isBodyOnlyHtml } from "@/lib/letter-renderer";
import { sendOutreachEmail } from "@/lib/email";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["approve", "reject", "send_email"]),
  rejectionNote: z.string().max(500).optional(),
});

type OutreachDraft = {
  subject?: string;
  bodyHtml?: string;
  recipient?: { name?: string; addressLines?: string };
  enrichment?: {
    applicantEmail?: string | null;
    agentEmail?: string | null;
  };
  contact?: { kind?: string; email?: string | null };
};

function recipientKind(kind: string | undefined): "applicant" | "agent" | undefined {
  if (kind === "agent") return "agent";
  if (kind === "applicant") return "applicant";
  return undefined;
}

function resolvedRecipientEmail(draft: OutreachDraft): string | null {
  const email =
    draft.contact?.email ??
    draft.enrichment?.agentEmail ??
    draft.enrichment?.applicantEmail ??
    null;
  const trimmed = email?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

export async function PATCH(req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canUseAutoOutreach) {
    return NextResponse.json(
      {
        error: "Outreach approvals require the Agency plan.",
        upgrade: true,
        upgradeHref: features.upgradeHref,
      },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const approval = await prisma.agentApproval.findUnique({ where: { id } });
  if (!approval || approval.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return NextResponse.json(
      { error: `Already ${approval.status}` },
      { status: 409 },
    );
  }

  if (parsed.data.action === "reject") {
    const updated = await prisma.agentApproval.update({
      where: { id },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectionNote: parsed.data.rejectionNote ?? null,
        approvedById: ctx.user.id,
      },
    });
    return NextResponse.json({
      approval: {
        ...updated,
        planningEntity: planningEntityToNumber(updated.planningEntity),
      },
    });
  }

  if (parsed.data.action === "send_email") {
    if (!ctx.company.prospectEmailOutreachEnabled) {
      return NextResponse.json(
        { error: "Prospect email outreach is disabled for this workspace." },
        { status: 403 },
      );
    }

    const draft = approval.draftJson as OutreachDraft;
    const to = resolvedRecipientEmail(draft);
    if (!to) {
      return NextResponse.json(
        { error: "No verified recipient email is available for this draft." },
        { status: 422 },
      );
    }
    if (!draft.subject || !draft.bodyHtml) {
      return NextResponse.json(
        { error: "Draft is incomplete and cannot be emailed." },
        { status: 422 },
      );
    }
    if (!isBodyOnlyHtml(draft.bodyHtml)) {
      return NextResponse.json(
        {
          error:
            "Draft bodyHtml must be a body-only HTML fragment. Please regenerate the draft.",
        },
        { status: 422 },
      );
    }

    const suppressed = await prisma.outreachEmailSuppression.findUnique({
      where: { companyId_email: { companyId: ctx.company.id, email: to } },
    });
    if (suppressed) {
      return NextResponse.json(
        { error: "This recipient is on the workspace suppression list." },
        { status: 409 },
      );
    }

    const compliance = await runComplianceGuardrail({
      ctx: { companyId: approval.companyId, userId: ctx.user.id },
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      channel: "email",
      recipientKind: recipientKind(draft.contact?.kind),
      letterPurpose: "planning_b2b_outreach",
    });
    if (!compliance.passed) {
      return NextResponse.json(
        {
          error: "Email compliance check failed.",
          issues: compliance.issues,
        },
        { status: 422 },
      );
    }

    const sent = await sendOutreachEmail({
      to,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      recipientName: draft.recipient?.name ?? "there",
      companyName: ctx.company.name,
      replyTo: ctx.company.email ?? ctx.user.email ?? null,
    });
    const now = new Date();
    const updated = await prisma.agentApproval.update({
      where: { id },
      data: {
        status: "sent",
        approvedAt: approval.approvedAt ?? now,
        approvedById: ctx.user.id,
        executedAt: now,
        sentAt: now,
        sentChannel: "email",
        sentTo: to,
        resendEmailId: sent.id,
      },
    });
    return NextResponse.json({
      approval: {
        ...updated,
        planningEntity: planningEntityToNumber(updated.planningEntity),
      },
      sentTo: to,
      resendEmailId: sent.id,
    });
  }

  try {
    const result = await materializeApprovalLetter({
      approval,
      userId: ctx.user.id,
      approvedById: ctx.user.id,
    });

    scheduleLetterPdfEmailDelivery({
      letterId: result.letter.id,
      autoPrint: false,
    });

    return NextResponse.json({
      approval: {
        ...result.approval,
        planningEntity: planningEntityToNumber(result.approval.planningEntity),
      },
      letterId: result.letter.id,
    });
  } catch (err) {
    if (err instanceof ApprovalMaterializationError) {
      return NextResponse.json(
        { error: err.message, issues: err.details },
        { status: err.status },
      );
    }
    throw err;
  }
}
