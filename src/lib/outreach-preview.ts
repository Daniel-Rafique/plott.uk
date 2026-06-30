import type { AgentApproval, Company, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { renderLetterHtml, type LetterInput } from "@/lib/letter-renderer";
import { renderOutreachEmailPreviewHtml } from "@/lib/email";
import {
  emailBodyHtml,
  emailSubject,
  letterBodyHtml,
  letterSubject,
  type OutreachDraftDisplay,
} from "@/lib/outreach-draft-display";
import { findAutomationUserId } from "@/lib/agent-approvals";

export type SignatoryUser = Pick<
  User,
  "id" | "email" | "name" | "signatureSvg" | "signatureBlobUrl" | "signatoryTitle"
>;

export type PreviewChannel = "letter" | "email";

export type PreviewOverrides = {
  letterBodyHtml?: string;
  emailBodyHtml?: string;
  emailSubject?: string;
  subject?: string;
};

export async function resolveSignatoryUser(args: {
  companyId: string;
  preferredUserId?: string | null;
}): Promise<SignatoryUser | null> {
  const select = {
    id: true,
    email: true,
    name: true,
    signatureSvg: true,
    signatureBlobUrl: true,
    signatoryTitle: true,
  } as const;

  if (args.preferredUserId) {
    const preferred = await prisma.user.findUnique({
      where: { id: args.preferredUserId },
      select,
    });
    if (preferred) return preferred;
  }

  const ownerId = await findAutomationUserId(args.companyId);
  if (!ownerId) return null;
  return prisma.user.findUnique({ where: { id: ownerId }, select });
}

export function buildLetterPreviewInput(args: {
  approval: Pick<AgentApproval, "subjectRef" | "kind">;
  draft: OutreachDraftDisplay;
  company: Company;
  user: SignatoryUser;
  overrides?: PreviewOverrides;
}): LetterInput {
  const body =
    args.overrides?.letterBodyHtml?.trim() ||
    letterBodyHtml(args.draft);
  const subject =
    args.overrides?.subject?.trim() || letterSubject(args.draft);

  return {
    company: args.company,
    user: {
      id: args.user.id,
      email: args.user.email,
      name: args.user.name,
      signatureSvg: args.user.signatureSvg,
      signatureBlobUrl: args.user.signatureBlobUrl,
      signatoryTitle: args.user.signatoryTitle,
    },
    addresseeName: args.draft.recipient?.name ?? "Sir or Madam",
    addressLines: args.draft.recipient?.addressLines ?? "",
    reference: args.approval.subjectRef ?? undefined,
    siteAddress: args.draft.siteAddress ?? undefined,
    templateBodyHtml: body,
    templateSubject: subject,
    applicantName: args.draft.enrichment?.applicantName,
    agentName: args.draft.enrichment?.agentName,
    contactKind:
      args.draft.contact?.kind === "agent" ||
      args.draft.contact?.kind === "applicant"
        ? args.draft.contact.kind
        : undefined,
  };
}

export function renderApprovalLetterHtml(args: {
  approval: Pick<AgentApproval, "subjectRef" | "kind">;
  draft: OutreachDraftDisplay;
  company: Company;
  user: SignatoryUser;
  overrides?: PreviewOverrides;
}): string {
  const input = buildLetterPreviewInput(args);
  return renderLetterHtml(input).html;
}

export function renderApprovalEmailHtml(args: {
  draft: OutreachDraftDisplay;
  company: Company;
  overrides?: PreviewOverrides;
}): string {
  const body =
    args.overrides?.emailBodyHtml?.trim() ||
    emailBodyHtml(args.draft);
  const subject =
    args.overrides?.emailSubject?.trim() ||
    emailSubject(args.draft);

  return renderOutreachEmailPreviewHtml({
    recipientName: args.draft.recipient?.name ?? "there",
    subject,
    bodyHtml: body,
    companyName: args.company.name,
  });
}

export function renderApprovalPreviewHtml(args: {
  channel: PreviewChannel;
  approval: Pick<AgentApproval, "subjectRef" | "kind">;
  draft: OutreachDraftDisplay;
  company: Company;
  user: SignatoryUser;
  overrides?: PreviewOverrides;
}): string {
  if (args.channel === "email") {
    return renderApprovalEmailHtml({
      draft: args.draft,
      company: args.company,
      overrides: args.overrides,
    });
  }
  return renderApprovalLetterHtml({
    approval: args.approval,
    draft: args.draft,
    company: args.company,
    user: args.user,
    overrides: args.overrides,
  });
}
