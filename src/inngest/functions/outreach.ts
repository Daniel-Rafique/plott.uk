/**
 * Outreach pipeline (Phase 7). Triggered by `outreach/lead.discovered`.
 *
 * Stages (each isolated via `step.run` so Inngest can retry independently):
 *   1. Classify ICP fit            → ICP classifier (Claude Haiku)
 *   2. Enrich applicant/agent      → enrichment agent (Claude Sonnet + tools)
 *   3. Draft outreach letter       → outreach drafter (Claude Sonnet + branding)
 *   4. Compliance guardrail        → regex + Claude Haiku
 *   5. Create AgentApproval row    → pending human approval, unless auto-approve
 *
 * The Phase 0 scaffold ships this file so the Inngest registry is wired up;
 * Phase 7 fills in the real stage implementations.
 */

import { inngest, type OutreachLeadDiscoveredPayload } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { classifyIcpFit } from "@/lib/ai/agents/icp-classifier";
import {
  resolveOutreachContact,
  type OutreachContact,
} from "@/lib/outreach-contact";
import { draftOutreachLetter } from "@/lib/ai/agents/outreach-drafter";
import { runComplianceGuardrail } from "@/lib/ai/agents/compliance";
import { getCompanyTier, isAgentKindAllowed } from "@/lib/ai/tiers";
import {
  findAutomationUserId,
  materializeApprovalLetter,
} from "@/lib/agent-approvals";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import { scheduleLetterPdfEmailDelivery } from "@/lib/letter-delivery";

function complianceRecipientKind(
  contact: Pick<OutreachContact, "kind">,
): "applicant" | "agent" | undefined {
  if (contact.kind === "agent") return "agent";
  if (contact.kind === "applicant") return "applicant";
  return undefined;
}

export const outreachLeadDiscovered = inngest.createFunction(
  {
    id: "outreach-lead-discovered",
    retries: 2,
    // Refusals branch off to the appeal-pitch pipeline via a matching trigger
    // with `isRefusal == true`. Keep this function for everything else.
    triggers: [
      {
        event: "outreach/lead.discovered",
        if: "event.data.isRefusal != true",
      },
    ],
  },
  async ({ event, step }) => {
    const {
      companyId,
      savedSearchId,
      planningEntity,
      reference,
      siteAddress,
      description,
    } = event.data as OutreachLeadDiscoveredPayload;

    const tierCheck = await step.run("tier-check", async () => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          subscriptionStatus: true,
          subscriptionPriceId: true,
          aiEnabled: true,
        },
      });
      if (!company?.aiEnabled) {
        return { allowed: false, reason: "AI disabled for workspace" } as const;
      }
      const features = getCompanyPlanFeatures(company);
      if (!features.canUseAutoOutreach) {
        return {
          allowed: false,
          reason: `Autonomous outreach requires the Agency plan (current: ${features.planName}).`,
        } as const;
      }
      const tier = getCompanyTier(company);
      if (!isAgentKindAllowed(tier, "outreach_drafter")) {
        return {
          allowed: false,
          reason: `Autonomous outreach requires the Agency plan (current: ${tier}).`,
        } as const;
      }
      return { allowed: true, tier } as const;
    });
    if (!tierCheck.allowed) {
      logger.info(
        { companyId, planningEntity, reason: tierCheck.reason },
        "outreach lead dropped — tier gate",
      );
      return { outcome: "skipped" as const, reason: tierCheck.reason };
    }

    const icp = await step.run("icp-classify", () =>
      classifyIcpFit({
        ctx: { companyId },
        candidate: {
          planningEntity,
          reference: reference ?? "",
          siteAddress: siteAddress ?? null,
          description: description ?? null,
        },
      }),
    );
    if (!icp.fit) {
      logger.info(
        { companyId, planningEntity, reason: icp.reason },
        "outreach lead dropped — not ICP fit",
      );
      return { outcome: "dropped" as const, reason: icp.reason };
    }

    const bundle = await step.run("enrich", () =>
      resolveOutreachContact({
        ctx: { companyId },
        reference: reference ?? "",
        planningEntity,
        siteAddress: siteAddress ?? null,
      }),
    );
    const primaryContact =
      bundle.candidates.find((c) => c.kind !== "manual") ??
      bundle.candidates[0];
    const enrichment = bundle.enrichment;
    const resolvedSiteAddress =
      [siteAddress, bundle.siteAddress].find(
        (s): s is string => typeof s === "string" && s.trim().length > 0,
      )?.trim() ?? null;

    const draft = await step.run("draft", () =>
      draftOutreachLetter({
        ctx: { companyId },
        contact: primaryContact,
        enrichment,
        siteAddress: siteAddress ?? null,
        description: description ?? null,
        reference: reference ?? "",
        icpReason: icp.reason,
      }),
    );

    const compliance = await step.run("compliance", () =>
      runComplianceGuardrail({
        ctx: { companyId },
        subject: draft.subject,
        bodyHtml: draft.bodyHtml,
        channel: "print",
        recipientKind: complianceRecipientKind(primaryContact),
        letterPurpose: "planning_b2b_outreach",
      }),
    );

    const approval = await step.run("create-approval", async () => {
      const savedSearch = await prisma.savedSearch.findUnique({
        where: { id: savedSearchId },
      });
      const threshold = savedSearch?.autoApproveBelowConfidence ?? null;
      const canAutoApprove =
        savedSearch?.autoOutreach === true &&
        compliance.passed &&
        threshold != null &&
        compliance.riskScore <= threshold;
      const row = await prisma.agentApproval.create({
        data: {
          companyId,
          agentRunId: draft.runId,
          kind: "outreach_letter",
          status: canAutoApprove ? "approved" : "pending",
          subjectRef: reference ?? null,
          planningEntity: BigInt(planningEntity),
          draftJson: {
            subject: draft.subject,
            bodyHtml: draft.bodyHtml,
            recipient: draft.recipient,
            enrichment: enrichment ?? undefined,
            contact: primaryContact,
            ...(resolvedSiteAddress ? { siteAddress: resolvedSiteAddress } : {}),
          },
          issuesJson: compliance.issues.length ? compliance.issues : undefined,
          confidence: compliance.riskScore,
          approvedAt: canAutoApprove ? new Date() : null,
        },
      });
      return { id: row.id, autoApproved: canAutoApprove };
    });

    let letterId: string | null = null;
    if (approval.autoApproved) {
      const materialized = await step.run("materialize-auto-approved-letter", async () => {
        const userId = await findAutomationUserId(companyId);
        if (!userId) {
          logger.warn(
            { companyId, approvalId: approval.id },
            "auto_outreach_materialization_skipped_no_user",
          );
          return null;
        }
        const row = await prisma.agentApproval.findUnique({
          where: { id: approval.id },
        });
        if (!row) return null;
        return materializeApprovalLetter({
          approval: row,
          userId,
          rerunCompliance: false,
        }).then((result) => {
          scheduleLetterPdfEmailDelivery({
            letterId: result.letter.id,
            autoPrint: false,
          });
          return result;
        });
      });
      letterId = materialized?.letter.id ?? null;
    }

    return {
      outcome: "queued" as const,
      approvalId: approval.id,
      autoApproved: approval.autoApproved,
      letterId,
    };
  },
);
