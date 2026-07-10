/**
 * Approve/reject/update/send an AgentApproval.
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
import { sanitizeHtmlFragment } from "@/lib/sanitize-html";
import {
  emailBodyHtml,
  emailSubject,
  letterBodyHtml,
  recipientEmail,
  type OutreachDraftDisplay,
} from "@/lib/outreach-draft-display";
import { validateLetterBodyShape } from "@/lib/letter-body-shape";
import { markPipelineContactedFromApproval } from "@/lib/pipeline";
import { logger } from "@/lib/logger";
import {
  assessEmailContact,
  trackContactBlocked,
} from "@/lib/contact-quality";
import { resolveOutreachContact } from "@/lib/outreach-contact";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({
    action: z.literal("reject"),
    rejectionNote: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("send_email"),
    force: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("update_draft"),
    letterBodyHtml: z.string().optional(),
    emailBodyHtml: z.string().optional(),
    emailSubject: z.string().max(140).optional(),
    subject: z.string().max(140).optional(),
  }),
  z.object({
    action: z.literal("refresh_contact"),
  }),
]);

function recipientKind(kind: string | undefined): "applicant" | "agent" | undefined {
  if (kind === "agent") return "agent";
  if (kind === "applicant") return "applicant";
  return undefined;
}

function serializeApproval<T extends { planningEntity: bigint | null }>(row: T) {
  return {
    ...row,
    planningEntity: planningEntityToNumber(row.planningEntity),
  };
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

  let approval = await prisma.agentApproval.findUnique({ where: { id } });
  if (!approval || approval.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.action === "update_draft") {
    if (approval.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot edit — already ${approval.status}` },
        { status: 409 },
      );
    }

    const existing = approval.draftJson as OutreachDraftDisplay;
    const nextDraft: OutreachDraftDisplay = { ...existing };

    if (typeof parsed.data.subject === "string") {
      nextDraft.subject = parsed.data.subject.trim();
    }
    if (typeof parsed.data.letterBodyHtml === "string") {
      const html = sanitizeHtmlFragment(parsed.data.letterBodyHtml);
      if (!isBodyOnlyHtml(html)) {
        return NextResponse.json(
          { error: "Letter body must be a HTML fragment only." },
          { status: 422 },
        );
      }
      const shape = validateLetterBodyShape(html, {
        recipientAddressLines: existing.recipient?.addressLines,
      });
      if (!shape.ok) {
        return NextResponse.json(
          { error: shape.issues[0]?.message ?? "Invalid letter body", issues: shape.issues },
          { status: 422 },
        );
      }
      nextDraft.letterBodyHtml = html;
      nextDraft.bodyHtml = html;
    }
    if (typeof parsed.data.emailBodyHtml === "string") {
      const html = sanitizeHtmlFragment(parsed.data.emailBodyHtml);
      if (!isBodyOnlyHtml(html)) {
        return NextResponse.json(
          { error: "Email body must be a HTML fragment only." },
          { status: 422 },
        );
      }
      nextDraft.emailBodyHtml = html;
    }
    if (typeof parsed.data.emailSubject === "string") {
      nextDraft.emailSubject = parsed.data.emailSubject.trim();
    }

    const complianceIssues: Array<{ severity: string; code: string; message: string }> =
      [];
    try {
      const print = await runComplianceGuardrail({
        ctx: { companyId: approval.companyId, userId: ctx.user.id },
        subject: nextDraft.subject ?? "",
        bodyHtml: letterBodyHtml(nextDraft),
        channel: "print",
        recipientKind: recipientKind(nextDraft.contact?.kind),
        letterPurpose: "planning_b2b_outreach",
      });
      complianceIssues.push(...print.issues);
      const to = recipientEmail(nextDraft);
      if (to && emailBodyHtml(nextDraft)) {
        const emailCheck = await runComplianceGuardrail({
          ctx: { companyId: approval.companyId, userId: ctx.user.id },
          subject: emailSubject(nextDraft),
          bodyHtml: emailBodyHtml(nextDraft),
          channel: "email",
          recipientKind: recipientKind(nextDraft.contact?.kind),
          letterPurpose: "planning_b2b_outreach",
        });
        complianceIssues.push(...emailCheck.issues);
      }
    } catch {
      // Non-blocking on save
    }

    const updated = await prisma.agentApproval.update({
      where: { id },
      data: { draftJson: nextDraft as object },
    });

    return NextResponse.json({
      approval: serializeApproval(updated),
      draft: nextDraft,
      complianceWarnings: complianceIssues.filter((i) => i.severity === "warn"),
    });
  }

  if (parsed.data.action === "refresh_contact") {
    if (approval.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot refresh — already ${approval.status}` },
        { status: 409 },
      );
    }
    const planningEntity = planningEntityToNumber(approval.planningEntity);
    const reference = approval.subjectRef?.trim();
    if (planningEntity == null || !reference) {
      return NextResponse.json(
        { error: "This approval is missing a planning reference to re-enrich." },
        { status: 422 },
      );
    }

    try {
      const existing = approval.draftJson as OutreachDraftDisplay;
      const bundle = await resolveOutreachContact({
        ctx: { companyId: ctx.company.id, userId: ctx.user.id },
        reference,
        planningEntity,
        siteAddress: existing.siteAddress ?? null,
        forceRefresh: true,
      });
      const primary =
        bundle.candidates.find((c) => c.kind !== "manual") ??
        bundle.candidates[0] ??
        null;
      const nextDraft: OutreachDraftDisplay = {
        ...existing,
        enrichment: bundle.enrichment
          ? {
              applicantName: bundle.enrichment.applicantName,
              applicantEmail: bundle.enrichment.applicantEmail,
              applicantEmailSource: bundle.enrichment.applicantEmailSource,
              applicantEmailConfidence:
                bundle.enrichment.applicantEmailConfidence,
              applicantEmailStatus: bundle.enrichment.applicantEmailStatus,
              agentName: bundle.enrichment.agentName,
              agentEmail: bundle.enrichment.agentEmail,
            }
          : existing.enrichment,
        ...(primary
          ? {
              contact: {
                kind: primary.kind,
                email: primary.email ?? null,
              },
              recipient: {
                name: primary.name,
                addressLines:
                  primary.addressLines ||
                  existing.recipient?.addressLines ||
                  "",
              },
            }
          : {}),
        ...(bundle.siteAddress ? { siteAddress: bundle.siteAddress } : {}),
      };

      const updated = await prisma.agentApproval.update({
        where: { id },
        data: { draftJson: nextDraft as object },
      });

      return NextResponse.json({
        approval: serializeApproval(updated),
        draft: nextDraft,
        preferredEmail: recipientEmail(nextDraft),
      });
    } catch (err) {
      logger.error({ err, approvalId: id }, "approval_refresh_contact_failed");
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Could not refresh contact details.",
        },
        { status: 502 },
      );
    }
  }

  if (approval.status !== "pending") {
    return NextResponse.json(
      { error: `Already ${approval.status}` },
      { status: 409 },
    );
  }

  approval = await prisma.agentApproval.findUnique({ where: { id } });
  if (!approval) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    return NextResponse.json({ approval: serializeApproval(updated) });
  }

  const draft = approval.draftJson as OutreachDraftDisplay;

  if (parsed.data.action === "send_email") {
    if (!ctx.company.prospectEmailOutreachEnabled) {
      return NextResponse.json(
        { error: "Prospect email outreach is disabled for this workspace." },
        { status: 403 },
      );
    }

    const toCheck = assessEmailContact({
      contactEmail: draft.contact?.email,
      contactKind: draft.contact?.kind,
      agentEmail: draft.enrichment?.agentEmail,
      applicantEmail: draft.enrichment?.applicantEmail,
      applicantEmailStatus: draft.enrichment?.applicantEmailStatus ?? null,
      applicantEmailConfidence: draft.enrichment?.applicantEmailConfidence ?? null,
      force: parsed.data.force ?? false,
    });
    if (!toCheck.ok && toCheck.blocking) {
      await trackContactBlocked({
        distinctId: ctx.user.id,
        companyId: ctx.company.id,
        channel: "email",
        code: toCheck.code,
      });
      return NextResponse.json(
        {
          error: toCheck.message,
          code: toCheck.code,
          preferredEmail: toCheck.preferredEmail,
          contactGate: true,
        },
        { status: 422 },
      );
    }

    const to = toCheck.preferredEmail ?? recipientEmail(draft);
    if (!to) {
      return NextResponse.json(
        { error: "No verified recipient email is available for this draft." },
        { status: 422 },
      );
    }

    const body = emailBodyHtml(draft);
    const subject = emailSubject(draft);
    if (!subject || !body) {
      return NextResponse.json(
        { error: "Draft is incomplete and cannot be emailed." },
        { status: 422 },
      );
    }
    if (!isBodyOnlyHtml(body)) {
      return NextResponse.json(
        {
          error:
            "Email body must be a body-only HTML fragment. Please edit and save the draft.",
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
      subject,
      bodyHtml: body,
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
      subject,
      bodyHtml: body,
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
    try {
      await markPipelineContactedFromApproval({
        companyId: ctx.company.id,
        agentApprovalId: updated.id,
        planningEntity: updated.planningEntity,
        applicationRef: updated.subjectRef,
        siteAddress: draft.siteAddress ?? null,
        distinctId: ctx.user.id,
      });
    } catch (err) {
      logger.warn(
        { err, approvalId: id },
        "pipeline upsert after email send failed",
      );
    }
    return NextResponse.json({
      approval: serializeApproval(updated),
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
      approval: serializeApproval(result.approval),
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
