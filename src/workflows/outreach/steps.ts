import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { classifyIcpFit } from "@/lib/ai/agents/icp-classifier";
import { classifyAppealViability } from "@/lib/ai/agents/appeal-classifier";
import { draftAppealPitchLetter } from "@/lib/ai/agents/appeal-pitch-drafter";
import { draftOutreachLetter } from "@/lib/ai/agents/outreach-drafter";
import { runComplianceGuardrail } from "@/lib/ai/agents/compliance";
import { getCompanyTier, isAgentKindAllowed } from "@/lib/ai/tiers";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import {
  resolveOutreachContact,
  type OutreachContact,
  type OutreachContactBundle,
} from "@/lib/outreach-contact";
import {
  findAutomationUserId,
  materializeApprovalLetter,
} from "@/lib/agent-approvals";
import { scheduleLetterPdfEmailDelivery } from "@/lib/letter-delivery";
import { scrapeLpaRefusalNotice } from "@/lib/lpa-portal";
import type { OutreachDraft } from "@/lib/ai/agents/outreach-drafter";
import type { AppealPitchDraft } from "@/lib/ai/agents/appeal-pitch-drafter";
import type { AppealClassification } from "@/lib/ai/agents/appeal-classifier";
import type { ComplianceResult } from "@/lib/ai/agents/compliance";
import type { OutreachLeadDiscoveredPayload } from "./types";
import {
  emailBodyHtml,
  emailSubject,
  letterBodyHtml,
  recipientEmail,
  toStoredDraftJson,
  type OutreachDraftDisplay,
} from "@/lib/outreach-draft-display";
import { validateLetterBodyShape } from "@/lib/letter-body-shape";

type OutreachTierCheck =
  | { allowed: true; tier: string }
  | { allowed: false; reason: string };

type AppealGate =
  | { allowed: true; tier: string; serviceType: string }
  | { allowed: false; reason: string };

type RefusalDetail = Awaited<ReturnType<typeof scrapeLpaRefusalNotice>>;

export async function logWorkflowEventStep(args: {
  message: string;
  context: Record<string, unknown>;
}): Promise<void> {
  "use step";

  logger.info(args.context, args.message);
}

function complianceRecipientKind(
  contact: Pick<OutreachContact, "kind">,
): "applicant" | "agent" | undefined {
  if (contact.kind === "agent") return "agent";
  if (contact.kind === "applicant") return "applicant";
  return undefined;
}

export async function checkOutreachTierStep(
  payload: Pick<OutreachLeadDiscoveredPayload, "companyId">,
): Promise<OutreachTierCheck> {
  "use step";

  const company = await prisma.company.findUnique({
    where: { id: payload.companyId },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionPriceId: true,
      subscriptionCurrentPeriodEnd: true,
      trialEndsAt: true,
      aiEnabled: true,
    },
  });
  if (!company?.aiEnabled) {
    return { allowed: false, reason: "AI disabled for workspace" };
  }
  const features = getCompanyPlanFeatures(company);
  if (!features.canUseAutoOutreach) {
    return {
      allowed: false,
      reason: `Autonomous outreach requires the Agency plan (current: ${features.planName}).`,
    };
  }
  const tier = getCompanyTier(company);
  if (!isAgentKindAllowed(tier, "outreach_drafter")) {
    return {
      allowed: false,
      reason: `Autonomous outreach requires the Agency plan (current: ${tier}).`,
    };
  }
  return { allowed: true, tier };
}

export async function classifyOutreachIcpStep(
  payload: Pick<
    OutreachLeadDiscoveredPayload,
    "companyId" | "planningEntity" | "reference" | "siteAddress" | "description"
  >,
) {
  "use step";

  return classifyIcpFit({
    ctx: { companyId: payload.companyId },
    candidate: {
      planningEntity: payload.planningEntity,
      reference: payload.reference ?? "",
      siteAddress: payload.siteAddress ?? null,
      description: payload.description ?? null,
    },
  });
}

export async function resolveOutreachContactStep(
  payload: Pick<
    OutreachLeadDiscoveredPayload,
    "companyId" | "planningEntity" | "reference" | "siteAddress"
  >,
): Promise<OutreachContactBundle> {
  "use step";

  return resolveOutreachContact({
    ctx: { companyId: payload.companyId },
    reference: payload.reference ?? "",
    planningEntity: payload.planningEntity,
    siteAddress: payload.siteAddress ?? null,
  });
}

export async function draftOutreachLetterStep(args: {
  payload: Pick<
    OutreachLeadDiscoveredPayload,
    "companyId" | "reference" | "siteAddress" | "description"
  >;
  contact: OutreachContact;
  bundle: Pick<OutreachContactBundle, "enrichment">;
  icpReason: string;
}): Promise<OutreachDraft> {
  "use step";

  return draftOutreachLetter({
    ctx: { companyId: args.payload.companyId },
    contact: args.contact,
    enrichment: args.bundle.enrichment,
    siteAddress: args.payload.siteAddress ?? null,
    description: args.payload.description ?? null,
    reference: args.payload.reference ?? "",
    icpReason: args.icpReason,
  });
}

async function mergeChannelCompliance(args: {
  companyId: string;
  draft: Pick<
    OutreachDraft | AppealPitchDraft,
    "subject" | "letterBodyHtml" | "emailSubject" | "emailBodyHtml"
  >;
  contact: OutreachContact;
  letterPurpose?: "planning_b2b_outreach";
}): Promise<ComplianceResult> {
  const stored: OutreachDraftDisplay = {
    subject: args.draft.subject,
    letterBodyHtml: args.draft.letterBodyHtml,
    emailSubject: args.draft.emailSubject,
    emailBodyHtml: args.draft.emailBodyHtml,
    contact: args.contact,
    recipient: { name: args.contact.name, addressLines: args.contact.addressLines },
  };
  const print = await runComplianceGuardrail({
    ctx: { companyId: args.companyId },
    subject: args.draft.subject,
    bodyHtml: letterBodyHtml(stored),
    channel: "print",
    recipientKind: complianceRecipientKind(args.contact),
    ...(args.letterPurpose ? { letterPurpose: args.letterPurpose } : {}),
  });

  const shape = validateLetterBodyShape(letterBodyHtml(stored), {
    recipientAddressLines: args.contact.addressLines,
  });
  const shapeIssues = shape.issues.map((issue) => ({
    severity: "warn" as const,
    code: issue.code,
    message: issue.message,
  }));

  let issues = [...print.issues, ...shapeIssues];
  let passed = print.passed;
  let riskScore = print.riskScore;

  const to = recipientEmail(stored);
  const emailHtml = emailBodyHtml(stored);
  if (to && emailHtml) {
    const emailCheck = await runComplianceGuardrail({
      ctx: { companyId: args.companyId },
      subject: emailSubject(stored) || args.draft.subject,
      bodyHtml: emailHtml,
      channel: "email",
      recipientKind: complianceRecipientKind(args.contact),
      ...(args.letterPurpose ? { letterPurpose: args.letterPurpose } : {}),
    });
    issues = [...issues, ...emailCheck.issues];
    passed = passed && emailCheck.passed;
    riskScore = Math.max(riskScore, emailCheck.riskScore);
  }

  return { passed, riskScore, issues };
}

export async function checkOutreachComplianceStep(args: {
  companyId: string;
  draft: Pick<
    OutreachDraft,
    "subject" | "letterBodyHtml" | "emailSubject" | "emailBodyHtml"
  >;
  contact: OutreachContact;
}): Promise<ComplianceResult> {
  "use step";

  return mergeChannelCompliance({
    companyId: args.companyId,
    draft: args.draft,
    contact: args.contact,
    letterPurpose: "planning_b2b_outreach",
  });
}

export async function createOutreachApprovalStep(args: {
  payload: Pick<
    OutreachLeadDiscoveredPayload,
    "companyId" | "savedSearchId" | "reference" | "planningEntity"
  >;
  draft: OutreachDraft;
  bundle: Pick<OutreachContactBundle, "enrichment" | "siteAddress">;
  contact: OutreachContact;
  compliance: ComplianceResult;
  resolvedSiteAddress: string | null;
}) {
  "use step";

  const savedSearch = await prisma.savedSearch.findUnique({
    where: { id: args.payload.savedSearchId },
  });
  const threshold = savedSearch?.autoApproveBelowConfidence ?? null;
  const canAutoApprove =
    savedSearch?.autoOutreach === true &&
    args.compliance.passed &&
    threshold != null &&
    args.compliance.riskScore <= threshold;
  const row = await prisma.agentApproval.create({
    data: {
      companyId: args.payload.companyId,
      agentRunId: args.draft.runId,
      kind: "outreach_letter",
      status: canAutoApprove ? "approved" : "pending",
      subjectRef: args.payload.reference ?? null,
      planningEntity: BigInt(args.payload.planningEntity),
      draftJson: toStoredDraftJson(args.draft, {
        enrichment: args.bundle.enrichment ?? undefined,
        contact: args.contact,
        ...(args.resolvedSiteAddress ? { siteAddress: args.resolvedSiteAddress } : {}),
      }),
      issuesJson: args.compliance.issues.length
        ? args.compliance.issues
        : undefined,
      confidence: args.compliance.riskScore,
      approvedAt: canAutoApprove ? new Date() : null,
    },
  });
  return { id: row.id, autoApproved: canAutoApprove };
}

export async function materializeAutoApprovedLetterStep(args: {
  companyId: string;
  approvalId: string;
}): Promise<{ letterId: string | null }> {
  "use step";

  const userId = await findAutomationUserId(args.companyId);
  if (!userId) {
    logger.warn(
      { companyId: args.companyId, approvalId: args.approvalId },
      "auto_outreach_materialization_skipped_no_user",
    );
    return { letterId: null };
  }
  const row = await prisma.agentApproval.findUnique({
    where: { id: args.approvalId },
  });
  if (!row) return { letterId: null };
  const result = await materializeApprovalLetter({
    approval: row,
    userId,
    rerunCompliance: false,
  });
  scheduleLetterPdfEmailDelivery({
    letterId: result.letter.id,
    autoPrint: false,
  });
  return { letterId: result.letter.id };
}

export async function checkAppealGateStep(
  payload: Pick<OutreachLeadDiscoveredPayload, "companyId">,
): Promise<AppealGate> {
  "use step";

  const company = await prisma.company.findUnique({
    where: { id: payload.companyId },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionPriceId: true,
      subscriptionCurrentPeriodEnd: true,
      trialEndsAt: true,
      aiEnabled: true,
    },
  });
  if (!company?.aiEnabled) {
    return { allowed: false, reason: "AI disabled for workspace" };
  }
  const tier = getCompanyTier(company);
  if (!isAgentKindAllowed(tier, "appeal_pitch_drafter")) {
    return {
      allowed: false,
      reason: `Refusal appeals require the Agency plan (current: ${tier}).`,
    };
  }

  const icp = await prisma.icpProfile.findUnique({
    where: { companyId: payload.companyId },
    select: { targetRefusals: true, appealServiceType: true },
  });
  if (!icp?.targetRefusals) {
    return {
      allowed: false,
      reason: "Refusal-appeals feature not enabled on ICP profile",
    };
  }
  return {
    allowed: true,
    tier,
    serviceType: icp.appealServiceType ?? "planning appeals",
  };
}

export async function scrapeRefusalNoticeStep(args: {
  councilWebsite: string | null | undefined;
  reference: string | null | undefined;
  planningEntity: number;
}): Promise<RefusalDetail> {
  "use step";

  if (!args.councilWebsite || !args.reference) return null;
  try {
    return await scrapeLpaRefusalNotice({
      councilWebsite: args.councilWebsite,
      reference: args.reference,
    });
  } catch (err) {
    logger.warn(
      { err, planningEntity: args.planningEntity, reference: args.reference },
      "appeal refusal notice scrape failed",
    );
    return null;
  }
}

export async function classifyAppealViabilityStep(args: {
  payload: Pick<
    OutreachLeadDiscoveredPayload,
    "companyId" | "planningEntity" | "reference" | "siteAddress" | "description" | "decision"
  >;
  bundle: Pick<OutreachContactBundle, "councilWebsite">;
  refusalDetail: RefusalDetail;
}): Promise<AppealClassification> {
  "use step";

  return classifyAppealViability({
    ctx: { companyId: args.payload.companyId },
    refusal: {
      planningEntity: args.payload.planningEntity,
      reference: args.payload.reference ?? "",
      siteAddress: args.payload.siteAddress ?? null,
      description: args.payload.description ?? null,
      decision: args.payload.decision ?? null,
      decisionDate: args.refusalDetail?.decisionDate ?? null,
      councilWebsite: args.bundle.councilWebsite ?? null,
    },
  });
}

export async function draftAppealPitchLetterStep(args: {
  payload: Pick<
    OutreachLeadDiscoveredPayload,
    "companyId" | "reference" | "siteAddress" | "description"
  >;
  contact: OutreachContact;
  bundle: Pick<OutreachContactBundle, "enrichment">;
  classification: AppealClassification;
  serviceType: string;
  refusalReason: string | null;
}): Promise<AppealPitchDraft> {
  "use step";

  return draftAppealPitchLetter({
    ctx: { companyId: args.payload.companyId },
    contact: args.contact,
    enrichment: args.bundle.enrichment,
    classification: args.classification,
    serviceType: args.serviceType,
    siteAddress: args.payload.siteAddress ?? null,
    description: args.payload.description ?? null,
    reference: args.payload.reference ?? "",
    refusalReason: args.refusalReason,
  });
}

export async function checkAppealComplianceStep(args: {
  companyId: string;
  draft: Pick<
    AppealPitchDraft,
    "subject" | "letterBodyHtml" | "emailSubject" | "emailBodyHtml"
  >;
  contact: OutreachContact;
}): Promise<ComplianceResult> {
  "use step";

  return mergeChannelCompliance({
    companyId: args.companyId,
    draft: args.draft,
    contact: args.contact,
  });
}

export async function createAppealApprovalStep(args: {
  payload: Pick<
    OutreachLeadDiscoveredPayload,
    "companyId" | "savedSearchId" | "reference" | "planningEntity"
  >;
  draft: AppealPitchDraft;
  bundle: Pick<OutreachContactBundle, "enrichment">;
  contact: OutreachContact;
  compliance: ComplianceResult;
  classification: AppealClassification;
  refusalReason: string | null;
  decisionDate: string | null;
  resolvedSiteAddress: string | null;
}) {
  "use step";

  const row = await prisma.agentApproval.create({
    data: {
      companyId: args.payload.companyId,
      agentRunId: args.draft.runId,
      kind: "appeal_pitch_letter",
      status: "pending",
      subjectRef: args.payload.reference ?? null,
      planningEntity: BigInt(args.payload.planningEntity),
      draftJson: toStoredDraftJson(args.draft, {
        enrichment: args.bundle.enrichment ?? undefined,
        contact: args.contact,
        ...(args.resolvedSiteAddress ? { siteAddress: args.resolvedSiteAddress } : {}),
        appeal: {
          purpose: "appeal_pitch",
          classification: args.classification,
          refusalReason: args.refusalReason,
          decisionDate: args.decisionDate,
        },
      }),
      issuesJson: args.compliance.issues.length
        ? args.compliance.issues
        : undefined,
      confidence: args.compliance.riskScore,
    },
  });

  logger.info(
    {
      companyId: args.payload.companyId,
      savedSearchId: args.payload.savedSearchId,
      planningEntity: args.payload.planningEntity,
      approvalId: row.id,
      grounds: args.classification.grounds,
      deadline: args.classification.deadlineDate,
    },
    "appeal_pitch_queued",
  );

  return { id: row.id };
}
