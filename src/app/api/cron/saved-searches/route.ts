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
import { DIGEST_EMAIL_MAX_LEADS } from "@/lib/digest-config";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import { start } from "workflow/api";
import {
  outreachLeadWorkflow,
  refusalAppealWorkflow,
} from "@/workflows/outreach/workflows";
import type { OutreachLeadDiscoveredPayload } from "@/workflows/outreach/types";

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

      const enriched = await enrichSearchResults(
        newOnes.slice(0, DIGEST_EMAIL_MAX_LEADS),
        { budgetMs: 8000 },
      );

      logger.info(
        { savedSearchId: s.id, totalFound: entities.length, newCount: newOnes.length },
        "cron_saved_search_results",
      );

      /** When true, new lead IDs stay out of `lastSeenIds` so the next run retries dispatch. */
      let outreachDispatchFailed = false;

      // Dispatch outreach events only if on Agency tier with AI enabled
      if (newOnes.length && s.autoOutreach && canAutoOutreach && s.company.aiEnabled) {
        const workflowPayloads: OutreachLeadDiscoveredPayload[] = newOnes.slice(0, 50).map((e) => {
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
