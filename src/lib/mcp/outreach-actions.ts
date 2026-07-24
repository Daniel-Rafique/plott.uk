import type { Company, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ApprovalMaterializationError,
  materializeApprovalLetter,
} from "@/lib/agent-approvals";
import { runComplianceGuardrail } from "@/lib/ai/agents/compliance";
import { assessEmailContact } from "@/lib/contact-quality";
import { sendOutreachEmail } from "@/lib/email";
import {
  emailBodyHtml,
  emailSubject,
  recipientEmail,
  type OutreachDraftDisplay,
} from "@/lib/outreach-draft-display";
import { isBodyOnlyHtml } from "@/lib/letter-renderer";
import { markPipelineContactedFromApproval } from "@/lib/pipeline";

type OutreachActor = {
  company: Company;
  user: User;
};

function recipientKind(kind: string | undefined): "applicant" | "agent" | undefined {
  if (kind === "agent" || kind === "applicant") return kind;
  return undefined;
}

export async function approveOutreach(
  actor: OutreachActor,
  approvalId: string,
) {
  const approval = await prisma.agentApproval.findFirst({
    where: { id: approvalId, companyId: actor.company.id },
  });
  if (!approval) throw new Error("Approval not found");
  if (approval.status !== "pending") {
    throw new Error(`Approval is already ${approval.status}`);
  }
  try {
    return await materializeApprovalLetter({
      approval,
      userId: actor.user.id,
      approvedById: actor.user.id,
    });
  } catch (error) {
    if (error instanceof ApprovalMaterializationError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export async function rejectOutreach(
  actor: OutreachActor,
  approvalId: string,
  note?: string,
) {
  const result = await prisma.agentApproval.updateMany({
    where: {
      id: approvalId,
      companyId: actor.company.id,
      status: "pending",
    },
    data: {
      status: "rejected",
      rejectedAt: new Date(),
      rejectionNote: note?.trim() || null,
      approvedById: actor.user.id,
    },
  });
  if (result.count !== 1) throw new Error("Pending approval not found");
  return prisma.agentApproval.findUniqueOrThrow({ where: { id: approvalId } });
}

export async function sendApprovedOutreach(
  actor: OutreachActor,
  approvalId: string,
  forceContact = false,
) {
  if (!actor.company.prospectEmailOutreachEnabled) {
    throw new Error("Prospect email outreach is disabled for this workspace");
  }
  const approval = await prisma.agentApproval.findFirst({
    where: { id: approvalId, companyId: actor.company.id },
  });
  if (!approval || approval.status !== "approved") {
    throw new Error("An approved, unsent outreach record is required");
  }
  const claimed = await prisma.agentApproval.updateMany({
    where: { id: approval.id, companyId: actor.company.id, status: "approved" },
    data: { status: "executing" },
  });
  if (claimed.count !== 1) throw new Error("Outreach is already being executed");

  try {
    const draft = approval.draftJson as OutreachDraftDisplay;
    const contact = assessEmailContact({
      contactEmail: draft.contact?.email,
      contactKind: draft.contact?.kind,
      agentEmail: draft.enrichment?.agentEmail,
      applicantEmail: draft.enrichment?.applicantEmail,
      applicantEmailStatus: draft.enrichment?.applicantEmailStatus ?? null,
      applicantEmailConfidence: draft.enrichment?.applicantEmailConfidence ?? null,
      force: forceContact,
    });
    if (!contact.ok && contact.blocking) throw new Error(contact.message);
    const to = contact.preferredEmail ?? recipientEmail(draft);
    const subject = emailSubject(draft);
    const bodyHtml = emailBodyHtml(draft);
    if (!to || !subject || !bodyHtml) throw new Error("Outreach draft is incomplete");
    if (!isBodyOnlyHtml(bodyHtml)) throw new Error("Email body must be body-only HTML");
    const suppressed = await prisma.outreachEmailSuppression.findUnique({
      where: { companyId_email: { companyId: actor.company.id, email: to } },
    });
    if (suppressed) throw new Error("Recipient is on the workspace suppression list");
    const compliance = await runComplianceGuardrail({
      ctx: { companyId: actor.company.id, userId: actor.user.id },
      subject,
      bodyHtml,
      channel: "email",
      recipientKind: recipientKind(draft.contact?.kind),
      letterPurpose: "planning_b2b_outreach",
    });
    if (!compliance.passed) {
      throw new Error(
        `Email compliance failed: ${compliance.issues.map((issue) => issue.message).join("; ")}`,
      );
    }
    const sent = await sendOutreachEmail({
      to,
      subject,
      bodyHtml,
      recipientName: draft.recipient?.name ?? "there",
      companyName: actor.company.name,
      replyTo: actor.company.email ?? actor.user.email ?? null,
    });
    const now = new Date();
    const updated = await prisma.agentApproval.update({
      where: { id: approval.id },
      data: {
        status: "sent",
        executedAt: now,
        sentAt: now,
        sentChannel: "email",
        sentTo: to,
        resendEmailId: sent.id,
      },
    });
    await markPipelineContactedFromApproval({
      companyId: actor.company.id,
      agentApprovalId: updated.id,
      planningEntity: updated.planningEntity,
      applicationRef: updated.subjectRef,
      siteAddress: draft.siteAddress ?? null,
      distinctId: actor.user.id,
    }).catch(() => null);
    return { approval: updated, sentTo: to, resendEmailId: sent.id };
  } catch (error) {
    await prisma.agentApproval.updateMany({
      where: { id: approval.id, status: "executing" },
      data: { status: "approved" },
    });
    throw error;
  }
}
