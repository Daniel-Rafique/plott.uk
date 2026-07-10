import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchPlanwireApplicationsByBbox,
  mapPlanwireToPlanningEntity,
  PlanwireRateLimitedError,
} from "@/lib/planwire";
import { enrichSearchResults } from "@/lib/enrichment";
import { sendDigestEmail } from "@/lib/email";
import { summariseDigest } from "@/lib/ai/agents/digest-summary";
import { lastSeenIdsToNumbers } from "@/lib/planning-entity-bigint";
import { logger } from "@/lib/logger";
import { isRefusalDecision } from "@/lib/refusal-detection";
import { getCompanyTier, type Tier } from "@/lib/ai/tiers";
import { DIGEST_EMAIL_MAX_LEADS, DIGEST_ICP_SCORE_CAP, OUTREACH_ESTIMATE_CAP } from "@/lib/digest-config";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import { start } from "workflow/api";
import {
  outreachLeadWorkflow,
  refusalAppealWorkflow,
} from "@/workflows/outreach/workflows";
import type { OutreachLeadDiscoveredPayload } from "@/workflows/outreach/types";
import { classifyIcpFit } from "@/lib/ai/agents/icp-classifier";
import { isAgentKindAllowed } from "@/lib/ai/tiers";
import {
  contactQualityFromEnrichment,
  rankDigestCandidates,
  type RankedDigestLead,
} from "@/lib/digest-ranking";
import { upsertPipelineLead } from "@/lib/pipeline";
import { ensureLeadAndEstimate, shouldIncludeBallparkInOutreach } from "@/lib/ai/agents/job-estimator";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  // Vercel also sends a header with the configured secret during cron
  const vercelHeader = req.headers.get("x-vercel-cron-secret");
  return vercelHeader === secret;
}

type SavedSearchBbox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

function dueForRun(freq: string, lastRunAt: Date | null): boolean {
  if (!lastRunAt) return true;
  const now = Date.now();
  const delta = now - lastRunAt.getTime();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  switch (freq) {
    case "daily":
      return delta >= 22 * HOUR;
    case "weekly":
      return delta >= 6 * DAY;
    case "monthly":
      return delta >= 28 * DAY;
    case "quarterly":
      return delta >= 85 * DAY;
    default:
      return delta >= 6 * DAY;
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searches = await prisma.savedSearch.findMany({
    include: { company: true },
  });

  const results: {
    id: string;
    ran: boolean;
    newCount: number;
    error?: string;
  }[] = [];

  for (const s of searches) {
    if (!dueForRun(s.frequency, s.lastRunAt)) {
      results.push({ id: s.id, ran: false, newCount: 0 });
      continue;
    }

    // Resolve company tier upfront to skip unnecessary work
    const tier: Tier = getCompanyTier(s.company);
    const features = getCompanyPlanFeatures(s.company);
    const canAutoOutreach = features.canUseAutoOutreach;
    const canUseAi = tier !== "free" && s.company.aiEnabled;

    // Skip entirely if no features are enabled for this search
    const wantsOutreach = s.autoOutreach;
    const wantsEmail = s.notifyEmails.length > 0;
    if (!wantsOutreach && !wantsEmail) {
      logger.info({ savedSearchId: s.id }, "cron_saved_search_skipped_no_outputs");
      results.push({ id: s.id, ran: false, newCount: 0 });
      continue;
    }
    // Skip if the only desired output is auto-outreach but tier doesn't support it
    if (wantsOutreach && !wantsEmail && !canAutoOutreach) {
      logger.info(
        { savedSearchId: s.id, tier, companyId: s.companyId },
        "cron_saved_search_skipped_outreach_tier_gate",
      );
      results.push({ id: s.id, ran: false, newCount: 0 });
      continue;
    }

    try {
      const bbox = s.bbox as unknown as SavedSearchBbox;
      if (
        !bbox ||
        typeof bbox.west !== "number" ||
        typeof bbox.south !== "number" ||
        typeof bbox.east !== "number" ||
        typeof bbox.north !== "number"
      ) {
        throw new Error("Invalid bbox");
      }
      const filters =
        (s.filters as unknown as Record<string, string[] | string | null>) ?? {};
      const apps = await fetchPlanwireApplicationsByBbox({
        west: bbox.west,
        south: bbox.south,
        east: bbox.east,
        north: bbox.north,
        limit: 100,
        filters: {
          developmentTypes: Array.isArray(filters.developmentTypes)
            ? (filters.developmentTypes as string[])
            : undefined,
          applicationTypes: Array.isArray(filters.applicationTypes)
            ? (filters.applicationTypes as string[])
            : undefined,
          statuses: Array.isArray(filters.statuses)
            ? (filters.statuses as string[])
            : undefined,
          decisionDateFrom:
            typeof filters.decisionFrom === "string"
              ? filters.decisionFrom
              : undefined,
          decisionDateTo:
            typeof filters.decisionTo === "string"
              ? filters.decisionTo
              : undefined,
          indexedSinceYear:
            typeof filters.indexedSinceYear === "string" &&
            filters.indexedSinceYear.trim() !== "" &&
            !Number.isNaN(Number(filters.indexedSinceYear))
              ? Math.floor(Number(filters.indexedSinceYear))
              : undefined,
        },
      });
      const entities = apps.map(mapPlanwireToPlanningEntity);
      const seen = new Set(lastSeenIdsToNumbers(s.lastSeenIds));
      const newOnes = entities.filter((e) => !seen.has(e.entity));

      // Enrich a capped pool for ranking (ICP score cap ≥ digest max).
      const enrichPool = newOnes.slice(
        0,
        Math.max(DIGEST_EMAIL_MAX_LEADS, DIGEST_ICP_SCORE_CAP),
      );
      const enrichedPool = await enrichSearchResults(enrichPool, {
        budgetMs: 10_000,
      });

      let ranked: RankedDigestLead[] = enrichedPool.map((app) => ({
        ...app,
        contactQuality: contactQualityFromEnrichment(app),
      }));

      // Score with ICP when available (capped).
      if (
        canUseAi &&
        isAgentKindAllowed(tier, "icp_classifier") &&
        ranked.length > 0
      ) {
        const toScore = ranked.slice(0, DIGEST_ICP_SCORE_CAP);
        const scored = await Promise.all(
          toScore.map(async (app) => {
            try {
              const icp = await classifyIcpFit({
                ctx: { companyId: s.companyId },
                candidate: {
                  planningEntity: app.entity,
                  reference: app.reference ?? "",
                  siteAddress: app["address-text"] ?? null,
                  description: app.description ?? null,
                  status: app["planning-application-status"] ?? null,
                  applicationType: app["planning-application-type"] ?? null,
                },
              });
              return {
                ...app,
                icpScore: icp.fit ? icp.score : icp.score * 0.25,
                icpFit: icp.fit,
              };
            } catch {
              return app;
            }
          }),
        );
        const scoredIds = new Set(scored.map((a) => a.entity));
        ranked = [
          ...scored,
          ...ranked.filter((a) => !scoredIds.has(a.entity)),
        ];
      }

      ranked = rankDigestCandidates(ranked);
      const topLeads = ranked.slice(0, DIGEST_EMAIL_MAX_LEADS);

      // Upsert pipeline leads for top digest picks; optionally estimate.
      for (const app of topLeads) {
        try {
          await upsertPipelineLead({
            companyId: s.companyId,
            planningEntity: app.entity,
            applicationRef: app.reference,
            siteAddress: app["address-text"],
            description: app.description,
            stage: "new",
          });
        } catch (err) {
          logger.warn(
            { err, entity: app.entity, savedSearchId: s.id },
            "cron_pipeline_upsert_failed",
          );
        }
      }

      if (
        canUseAi &&
        isAgentKindAllowed(tier, "job_estimator") &&
        topLeads.length > 0
      ) {
        const hasRateCard = await prisma.companyRateCard.findUnique({
          where: { companyId: s.companyId },
          select: { id: true },
        });
        if (hasRateCard) {
          for (const app of topLeads.slice(0, DIGEST_EMAIL_MAX_LEADS)) {
            try {
              const lead = await ensureLeadAndEstimate({
                companyId: s.companyId,
                planningEntity: app.entity,
                applicationRef: app.reference,
                siteAddress: app["address-text"],
                description: app.description,
                status: app["planning-application-status"],
              });
              if (
                lead.estimateMinGbp != null &&
                lead.estimateMaxGbp != null &&
                lead.estimateWeeks != null
              ) {
                const confidence =
                  typeof lead.estimateJson === "object" &&
                  lead.estimateJson &&
                  "confidence" in lead.estimateJson
                    ? Number(
                        (lead.estimateJson as { confidence?: number }).confidence,
                      ) || 0
                    : 0;
                if (
                  shouldIncludeBallparkInOutreach({
                    includeFlag: lead.includeBallparkInOutreach,
                    confidence,
                  })
                ) {
                  app.ballpark = {
                    minGbp: lead.estimateMinGbp,
                    maxGbp: lead.estimateMaxGbp,
                    weeks: lead.estimateWeeks,
                  };
                }
              }
            } catch (err) {
              logger.warn(
                { err, entity: app.entity },
                "cron_digest_estimate_failed",
              );
            }
          }
        }
      }

      const enriched = topLeads;

      logger.info(
        { savedSearchId: s.id, totalFound: entities.length, newCount: newOnes.length, digestCount: enriched.length },
        "cron_saved_search_results",
      );

      /** When true, new lead IDs stay out of `lastSeenIds` so the next run retries dispatch. */
      let outreachDispatchFailed = false;

      // Dispatch outreach events only if on Agency tier with AI enabled
      if (newOnes.length && s.autoOutreach && canAutoOutreach && s.company.aiEnabled) {
        const estimateEntities = new Set(
          ranked
            .filter((e) => newOnes.some((n) => n.entity === e.entity))
            .slice(0, OUTREACH_ESTIMATE_CAP)
            .map((e) => e.entity),
        );
        const workflowPayloads: OutreachLeadDiscoveredPayload[] = newOnes
          .slice(0, 50)
          .map((e) => {
          const status = e["planning-application-status"] ?? undefined;
          const decision = e["planning-decision-type"] ?? undefined;
          const isRefusal = isRefusalDecision({ status, decision });
          return {
            companyId: s.companyId,
            savedSearchId: s.id,
            planningEntity: e.entity,
            reference: e.reference ?? undefined,
            siteAddress: e["address-text"] ?? undefined,
            description: e.description ?? undefined,
            status,
            decision,
            isRefusal,
            runEstimate: estimateEntities.has(e.entity),
          };
        });
        if (workflowPayloads.length > 0) {
          try {
            await Promise.all(
              workflowPayloads.map((payload) =>
                start(
                  payload.isRefusal ? refusalAppealWorkflow : outreachLeadWorkflow,
                  [payload],
                ),
              ),
            );
            logger.info(
              { savedSearchId: s.id, workflowCount: workflowPayloads.length },
              "cron_outreach_workflows_started",
            );
          } catch (err) {
            outreachDispatchFailed = true;
            logger.error({ err, savedSearchId: s.id }, "cron_workflow_dispatch_failed");
          }
        }
      } else if (newOnes.length && s.autoOutreach && !canAutoOutreach) {
        logger.info(
          { savedSearchId: s.id, tier, companyId: s.companyId },
          "cron_outreach_skipped_requires_agency_tier",
        );
      } else if (newOnes.length && s.autoOutreach && !s.company.aiEnabled) {
        logger.info({ savedSearchId: s.id }, "cron_outreach_skipped_ai_disabled");
      }

      if (newOnes.length && s.notifyEmails.length) {
        // AI summary requires paid tier (starter+) with AI enabled
        const aiSummary = canUseAi
          ? await summariseDigest({
              ctx: { companyId: s.companyId },
              searchName: s.name,
              applications: enriched,
            })
          : null;
        try {
          await sendDigestEmail({
            to: s.notifyEmails,
            companyName: s.company.name,
            searchName: s.name,
            savedSearchId: s.id,
            newApplications: enriched,
            totalNew: newOnes.length,
            aiSummary,
          });
          logger.info({ savedSearchId: s.id, recipients: s.notifyEmails.length }, "cron_digest_email_sent");
        } catch (err) {
          logger.error({ err, savedSearchId: s.id }, "cron_digest_email_failed");
        }
      } else if (newOnes.length === 0) {
        logger.info({ savedSearchId: s.id }, "cron_no_new_applications");
      }

      const entityBigIntsForSeen = outreachDispatchFailed
        ? entities.filter((e) => seen.has(e.entity)).map((e) => BigInt(e.entity))
        : entities.map((e) => BigInt(e.entity));
      if (outreachDispatchFailed) {
        logger.warn(
          { savedSearchId: s.id, withheldNewLeadCount: newOnes.length },
          "cron_outreach_last_seen_unchanged_pending_retry",
        );
      }

      await prisma.savedSearch.update({
        where: { id: s.id },
        data: {
          lastRunAt: new Date(),
          lastRunCount: newOnes.length,
          lastSeenIds: Array.from(
            new Set([
              ...s.lastSeenIds.map((id) => BigInt(id)),
              ...entityBigIntsForSeen,
            ]),
          ).slice(-2000),
        },
      });

      results.push({ id: s.id, ran: true, newCount: newOnes.length });
    } catch (e) {
      if (e instanceof PlanwireRateLimitedError) {
        // Don't consume the run slot — the next cron tick will retry once the
        // circuit breaker resets. We surface the reason so it shows up in
        // Vercel cron logs without needing to open the PlanWire dashboard.
        logger.warn(
          { savedSearchId: s.id, retryAfterMs: e.retryAfterMs },
          "cron_saved_search_planwire_rate_limited",
        );
        results.push({
          id: s.id,
          ran: false,
          newCount: 0,
          error: "planwire_rate_limited",
        });
        continue;
      }
      results.push({
        id: s.id,
        ran: false,
        newCount: 0,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
