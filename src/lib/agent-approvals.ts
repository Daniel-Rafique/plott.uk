import type { AgentApproval } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runComplianceGuardrail } from "@/lib/ai/agents/compliance";
import { logger } from "@/lib/logger";
import { isBodyOnlyHtml } from "@/lib/letter-renderer";
import { sanitizeHtmlFragment } from "@/lib/sanitize-html";

type OutreachDraft = {
  subject?: string;
  bodyHtml?: string;
  recipient?: { name?: string; addressLines?: string };
  enrichment?: { applicantName?: string | null; agentName?: string | null };
  /** Snapshot from autonomous outreach (see `draftJson` in outreach Inngest). */
  contact?: { kind?: string };
  /** Planning site (application property), if known — used for PDF Re: line. */
  siteAddress?: string | null;
  appeal?: {
    purpose?: string;
    classification?: unknown;
    refusalReason?: string | null;
    decisionDate?: string | null;
  };
};

function outreachComplianceRecipientKind(
  kind: string | undefined,
): "applicant" | "agent" | undefined {
  if (kind === "agent") return "agent";
  if (kind === "applicant") return "applicant";
  return undefined;
}

export class ApprovalMaterializationError extends Error {
  constructor(
    message: string,
    public readonly status = 422,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApprovalMaterializationError";
  }
}

export function approvalPurpose(
  approval: Pick<AgentApproval, "kind" | "draftJson">,
): "outreach" | "appeal_pitch" {
  const draft = approval.draftJson as OutreachDraft;
  return approval.kind === "appeal_pitch_letter" ||
    draft.appeal?.purpose === "appeal_pitch"
    ? "appeal_pitch"
    : "outreach";
}

export async function findAutomationUserId(companyId: string): Promise<string | null> {
  const owner = await prisma.membership.findFirst({
    where: { companyId, role: "owner" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (owner) return owner.userId;

  const membership = await prisma.membership.findFirst({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return membership?.userId ?? null;
}

export async function materializeApprovalLetter({
  approval,
  userId,
  approvedById,
  rerunCompliance = true,
}: {
  approval: AgentApproval;
  userId: string;
  approvedById?: string | null;
  rerunCompliance?: boolean;
}) {
  if (approval.status !== "pending" && approval.status !== "approved") {
    throw new ApprovalMaterializationError(`Already ${approval.status}`, 409);
  }
  if (approval.executedAt) {
    throw new ApprovalMaterializationError("Approval already materialised", 409);
  }

  const draft = approval.draftJson as OutreachDraft;
  if (!draft?.subject || !draft?.bodyHtml || !draft?.recipient?.addressLines) {
    throw new ApprovalMaterializationError(
      "Draft is incomplete and cannot be approved",
    );
  }
  const subject = draft.subject;
  const bodyHtml = draft.bodyHtml;
  const addressLines = draft.recipient.addressLines;
  const recipientName = draft.recipient.name ?? "Sir or Madam";

  if (!isBodyOnlyHtml(bodyHtml)) {
    logger.warn(
      { approvalId: approval.id, kind: approval.kind },
      "AI draft contained full-document HTML; rejecting approval to protect letter shape",
    );
    throw new ApprovalMaterializationError(
      "Draft bodyHtml must be a body-only HTML fragment. This usually indicates a model regression - please regenerate the draft.",
    );
  }

  const purpose = approvalPurpose(approval);
  const siteAddress =
    typeof draft.siteAddress === "string" && draft.siteAddress.trim().length > 0
      ? draft.siteAddress.trim()
      : null;

  if (rerunCompliance) {
    try {
      const isPlanningOutreach =
        approval.kind === "outreach_letter" && purpose === "outreach";
      const compliance = await runComplianceGuardrail({
        ctx: { companyId: approval.companyId, userId },
        subject,
        bodyHtml,
        ...(isPlanningOutreach
          ? {
              channel: "print" as const,
              recipientKind: outreachComplianceRecipientKind(draft.contact?.kind),
              letterPurpose: "planning_b2b_outreach" as const,
            }
          : {}),
      });
      if (!compliance.passed) {
        throw new ApprovalMaterializationError(
          "Compliance check failed on approve",
          422,
          compliance.issues,
        );
      }
    } catch (err) {
      if (err instanceof ApprovalMaterializationError) throw err;
      logger.warn(
        { err, approvalId: approval.id },
        "compliance re-check errored; allowing approve",
      );
    }
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const current = await tx.agentApproval.findUnique({
      where: { id: approval.id },
      select: { executedAt: true },
    });
    if (current?.executedAt) {
      throw new ApprovalMaterializationError("Approval already materialised", 409);
    }

    const letter = await tx.letter.create({
      data: {
        companyId: approval.companyId,
        userId,
        applicationRef: approval.subjectRef ?? null,
        planningEntity: approval.planningEntity ?? null,
        siteAddress,
        recipientName,
        addressLines,
        subject,
        bodyHtml: sanitizeHtmlFragment(bodyHtml),
        status: "draft",
        purpose,
      },
    });

    const updated = await tx.agentApproval.update({
      where: { id: approval.id },
      data: {
        status: "approved",
        approvedAt: approval.approvedAt ?? now,
        approvedById: approvedById ?? approval.approvedById ?? null,
        executedAt: now,
      },
    });

    return { approval: updated, letter };
  });
}
