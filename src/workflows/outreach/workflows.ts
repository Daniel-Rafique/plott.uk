import type { OutreachContact, OutreachContactBundle } from "@/lib/outreach-contact";
import type { OutreachLeadDiscoveredPayload, WorkflowOutcome } from "./types";
import {
  checkAppealComplianceStep,
  checkAppealGateStep,
  checkOutreachComplianceStep,
  checkOutreachTierStep,
  classifyAppealViabilityStep,
  classifyOutreachIcpStep,
  createAppealApprovalStep,
  createOutreachApprovalStep,
  draftAppealPitchLetterStep,
  draftOutreachLetterStep,
  logWorkflowEventStep,
  materializeAutoApprovedLetterStep,
  resolveOutreachContactStep,
  scrapeRefusalNoticeStep,
} from "./steps";

function primaryContactFrom(bundle: OutreachContactBundle): OutreachContact {
  const contact =
    bundle.candidates.find((c) => c.kind !== "manual") ?? bundle.candidates[0];
  if (!contact) {
    throw new Error("Outreach contact bundle had no candidates");
  }
  return contact;
}

function resolvedSiteAddress(
  inputAddress: string | undefined,
  bundleAddress: string | null,
): string | null {
  return (
    [inputAddress, bundleAddress].find(
      (s): s is string => typeof s === "string" && s.trim().length > 0,
    )?.trim() ?? null
  );
}

export async function outreachLeadWorkflow(
  payload: OutreachLeadDiscoveredPayload,
): Promise<WorkflowOutcome> {
  "use workflow";

  const tierCheck = await checkOutreachTierStep(payload);
  if (!tierCheck.allowed) {
    await logWorkflowEventStep({
      context: {
        companyId: payload.companyId,
        planningEntity: payload.planningEntity,
        reason: tierCheck.reason,
      },
      message: "outreach lead dropped — tier gate",
    });
    return { outcome: "skipped", reason: tierCheck.reason };
  }

  const icp = await classifyOutreachIcpStep(payload);
  if (!icp.fit) {
    await logWorkflowEventStep({
      context: {
        companyId: payload.companyId,
        planningEntity: payload.planningEntity,
        reason: icp.reason,
      },
      message: "outreach lead dropped — not ICP fit",
    });
    return { outcome: "dropped", reason: icp.reason };
  }

  const bundle = await resolveOutreachContactStep(payload);
  const primaryContact = primaryContactFrom(bundle);
  const siteAddress = resolvedSiteAddress(payload.siteAddress, bundle.siteAddress);

  const draft = await draftOutreachLetterStep({
    payload,
    contact: primaryContact,
    bundle,
    icpReason: icp.reason,
  });

  const compliance = await checkOutreachComplianceStep({
    companyId: payload.companyId,
    draft,
    contact: primaryContact,
  });

  const approval = await createOutreachApprovalStep({
    payload,
    draft,
    bundle,
    contact: primaryContact,
    compliance,
    resolvedSiteAddress: siteAddress,
  });

  let letterId: string | null = null;
  if (approval.autoApproved) {
    const materialized = await materializeAutoApprovedLetterStep({
      companyId: payload.companyId,
      approvalId: approval.id,
    });
    letterId = materialized.letterId;
  }

  return {
    outcome: "queued",
    approvalId: approval.id,
    autoApproved: approval.autoApproved,
    letterId,
  };
}

export async function refusalAppealWorkflow(
  payload: OutreachLeadDiscoveredPayload,
): Promise<WorkflowOutcome> {
  "use workflow";

  const gate = await checkAppealGateStep(payload);
  if (!gate.allowed) {
    await logWorkflowEventStep({
      context: {
        companyId: payload.companyId,
        planningEntity: payload.planningEntity,
        reason: gate.reason,
      },
      message: "appeal lead dropped — gate",
    });
    return { outcome: "skipped", reason: gate.reason };
  }

  const bundle = await resolveOutreachContactStep(payload);
  const primaryContact = primaryContactFrom(bundle);
  const refusalDetail = await scrapeRefusalNoticeStep({
    councilWebsite: bundle.councilWebsite,
    reference: payload.reference,
    planningEntity: payload.planningEntity,
  });

  const classification = await classifyAppealViabilityStep({
    payload,
    bundle,
    refusalDetail,
  });
  if (!classification.viable) {
    await logWorkflowEventStep({
      context: {
        companyId: payload.companyId,
        planningEntity: payload.planningEntity,
        confidence: classification.confidence,
        reason: classification.summary,
      },
      message: "appeal lead dropped — not viable",
    });
    return { outcome: "dropped", reason: classification.summary };
  }

  const refusalReason =
    refusalDetail?.decisionSummary ?? refusalDetail?.decisionReasons ?? null;
  const siteAddress = resolvedSiteAddress(payload.siteAddress, bundle.siteAddress);

  const draft = await draftAppealPitchLetterStep({
    payload,
    contact: primaryContact,
    bundle,
    classification,
    serviceType: gate.serviceType,
    refusalReason,
  });

  const compliance = await checkAppealComplianceStep({
    companyId: payload.companyId,
    draft,
  });

  const approval = await createAppealApprovalStep({
    payload,
    draft,
    bundle,
    contact: primaryContact,
    compliance,
    classification,
    refusalReason,
    decisionDate: refusalDetail?.decisionDate ?? null,
    resolvedSiteAddress: siteAddress,
  });

  return { outcome: "queued", approvalId: approval.id };
}
