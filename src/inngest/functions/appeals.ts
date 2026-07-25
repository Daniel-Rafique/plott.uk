/**
 * Refusal-appeals pipeline. Triggered by `outreach/lead.discovered` events
 * where `isRefusal === true` so refused applications are routed here instead
 * of through the standard outreach drafter.
 *
 * Stages (each isolated via `step.run` so Inngest can retry independently):
 *   1. Tier + ICP opt-in gate (company must be on Agency tier AND have the
 *      ICP's `targetRefusals` flag enabled).
 *   2. Classify appeal viability (appeal-classifier agent scrapes decision
 *      notice + weighs common grounds).
 *   3. Enrich applicant/agent contact details (same resolver as outreach).
 *   4. Draft the appeal pitch letter (appeal-pitch-drafter agent).
 *   5. Compliance guardrail (re-used regex + Haiku check).
 *   6. Create AgentApproval row with kind `appeal_pitch_letter` for human
 *      review (we never auto-approve appeal pitches — the legal framing
 *      warrants a person reviewing).
 *
 * Letters created from approval inherit `purpose = "appeal_pitch"` via the
 * approval handler so downstream digests / reports can separate outreach
 * traffic from appeals traffic.
 */

import { inngest, type OutreachLeadDiscoveredPayload } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { classifyAppealViability } from "@/lib/ai/agents/appeal-classifier";
import { draftAppealPitchLetter } from "@/lib/ai/agents/appeal-pitch-drafter";
import { resolveOutreachContact } from "@/lib/outreach-contact";
import { runComplianceGuardrail } from "@/lib/ai/agents/compliance";
import { getCompanyTier, isAgentKindAllowed } from "@/lib/ai/tiers";
import { scrapeLpaRefusalNotice } from "@/lib/lpa-portal";

export const refusalAppealDiscovered = inngest.createFunction(
  {
    id: "refusal-appeal-discovered",
    retries: 2,
    // Share the discovery event but branch on the isRefusal flag so the
    // standard outreach fn ignores refusals and we pick them up here.
    triggers: [
      { event: "outreach/lead.discovered", if: "event.data.isRefusal == true" },
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
      decision,
    } = event.data as OutreachLeadDiscoveredPayload;

    const gate = await step.run("tier-and-icp-gate", async () => {
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
      const tier = getCompanyTier(company);
      if (!isAgentKindAllowed(tier, "appeal_pitch_drafter")) {
        return {
          allowed: false,
          reason: `Refusal appeals require the Agency plan (current: ${tier}).`,
        } as const;
      }

      // ICP opt-in: a company only processes refusals into pitches when
      // they've explicitly declared an appeal service offering. This stops
      // construction-firm tenants from getting random legal pitch drafts.
      const icp = await prisma.icpProfile.findUnique({
        where: { companyId },
        select: { targetRefusals: true, appealServiceType: true },
      });
      if (!icp?.targetRefusals) {
        return {
          allowed: false,
          reason: "Refusal-appeals feature not enabled on ICP profile",
        } as const;
      }
      return {
        allowed: true,
        tier,
        serviceType: icp.appealServiceType ?? "planning appeals",
      } as const;
    });
    if (!gate.allowed) {
      logger.info(
        { companyId, planningEntity, reason: gate.reason },
        "appeal lead dropped — gate",
      );
      return { outcome: "skipped" as const, reason: gate.reason };
    }

    // Enrich first so the classifier has the council website for scraping and
    // we have an addressee by the time we draft.
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

    // Try to pull the raw refusal-notice text up-front so both the
    // classifier and the drafter have something concrete to reason about.
    const refusalDetail = await step.run("scrape-refusal-notice", async () => {
      if (!bundle.councilWebsite || !reference) return null;
      try {
        return await scrapeLpaRefusalNotice({
          councilWebsite: bundle.councilWebsite,
          reference,
        });
      } catch (err) {
        logger.warn(
          { err, planningEntity, reference },
          "appeal refusal notice scrape failed",
        );
        return null;
      }
    });

    const classification = await step.run("classify-viability", () =>
      classifyAppealViability({
        ctx: { companyId },
        refusal: {
          planningEntity,
          reference: reference ?? "",
          siteAddress: siteAddress ?? null,
          description: description ?? null,
          decision: decision ?? null,
          decisionDate: refusalDetail?.decisionDate ?? null,
          councilWebsite: bundle.councilWebsite ?? null,
        },
      }),
    );
    if (!classification.viable) {
      logger.info(
        {
          companyId,
          planningEntity,
          confidence: classification.confidence,
          reason: classification.summary,
        },
        "appeal lead dropped — not viable",
      );
      return { outcome: "dropped" as const, reason: classification.summary };
    }

    const refusalReasonText =
      refusalDetail?.decisionSummary ??
      refusalDetail?.decisionReasons ??
      null;

    const resolvedSiteAddress =
      [siteAddress, bundle.siteAddress].find(
        (s): s is string => typeof s === "string" && s.trim().length > 0,
      )?.trim() ?? null;

    const draft = await step.run("draft-pitch", () =>
      draftAppealPitchLetter({
        ctx: { companyId },
        contact: primaryContact,
        enrichment: bundle.enrichment,
        classification,
        serviceType: gate.serviceType,
        siteAddress: siteAddress ?? null,
        description: description ?? null,
        reference: reference ?? "",
        refusalReason: refusalReasonText,
      }),
    );

    const compliance = await step.run("compliance", () =>
      runComplianceGuardrail({
        ctx: { companyId },
        subject: draft.subject,
        bodyHtml: draft.bodyHtml,
      }),
    );

    const approval = await step.run("create-approval", async () => {
      // Appeal pitches are always queued for human review — the legal/
      // regulatory context means we don't want the auto-approve path, even
      // when compliance passes. This is intentional, not a bug.
      const row = await prisma.agentApproval.create({
        data: {
          companyId,
          agentRunId: draft.runId,
          kind: "appeal_pitch_letter",
          status: "pending",
          subjectRef: reference ?? null,
          planningEntity: BigInt(planningEntity),
          draftJson: {
            subject: draft.subject,
            bodyHtml: draft.bodyHtml,
            recipient: draft.recipient,
            enrichment: bundle.enrichment ?? undefined,
            contact: primaryContact,
            ...(resolvedSiteAddress ? { siteAddress: resolvedSiteAddress } : {}),
            // Stash the appeal metadata so the approvals UI can surface it
            // and the approval handler can tag the materialised Letter.
            appeal: {
              purpose: "appeal_pitch",
              classification,
              refusalReason: refusalReasonText,
              decisionDate: refusalDetail?.decisionDate ?? null,
            },
          },
          issuesJson: compliance.issues.length ? compliance.issues : undefined,
          confidence: compliance.riskScore,
        },
      });
      return { id: row.id };
    });

    logger.info(
      {
        companyId,
        savedSearchId,
        planningEntity,
        approvalId: approval.id,
        grounds: classification.grounds,
        deadline: classification.deadlineDate,
      },
      "appeal_pitch_queued",
    );

    return { outcome: "queued" as const, approvalId: approval.id };
  },
);
