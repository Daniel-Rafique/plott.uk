/**
 * Streaming deep-search endpoint. Single entry point for the Explore input:
 *
 *   1. Parse the prompt into structured filters (shared nl_search parser).
 *   2. Geocode any location hint into a map viewport.
 *   3. Run the fast path: bbox search over PlanWire (full UK coverage) with the filters.
 *   4. If `applicantLike` is set OR the fast path returned 0 rows, escalate to
 *      the agent path which procedurally enriches the top N candidates and
 *      fuzzy-matches by applicant/agent name (with Companies House fallback
 *      for acronyms / variant spellings).
 *
 * Emits NDJSON frames so the client can progressively update the UI without
 * waiting for the full pipeline. Each frame is one line:
 *
 *   {"type":"parsed","filters":{...}}
 *   {"type":"viewport","bounds":{west,south,east,north},"place":"Brixton"}
 *   {"type":"status","message":"Searching Companies House for Argent…"}
 *   {"type":"results","entities":[...],"total":42,"mode":"fast"}
 *   {"type":"done","mode":"agent","costGbp":0.004,"tookMs":4281}
 *   {"type":"error","message":"…"}
 */

import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  AgentBudgetError,
  AgentProviderError,
  AgentTierError,
} from "@/lib/ai/runtime";
import { logger } from "@/lib/logger";
import {
  filterSchema,
  parseNlSearch,
  type NlFilterResult,
} from "@/lib/ai/nl-search-parse";
import { geocodePlace, type GeocodeViewport } from "@/lib/geocode";
import {
  bboxAreaKm2,
  type PlanningApplicationEntity,
} from "@/lib/planning-data";
import {
  fetchPlanwireApplicationsByBbox,
  mapPlanwireToPlanningEntity,
  PlanwireRateLimitedError,
} from "@/lib/planwire";
import { resolveOutreachContact } from "@/lib/outreach-contact";
import {
  countApplicantOrCompanyMatches,
  rankPlanningResultsByApplicantOrCompany,
} from "@/lib/planning-result-ranking";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z
  .object({
    /** Used when the client does not send pre-parsed `filters` (NL bar). */
    prompt: z.string().max(400).optional().default(""),
    /**
     * Pre-parsed filters from the Explore manual tag / date controls. Skips
     * the LLM parse step; same downstream pipeline as a bar search.
     */
    filters: filterSchema.optional(),
    /**
     * The client's current map viewport. Used when the prompt has no
     * location hint so we still have a bbox to search against.
     */
    currentBounds: z
      .object({
        west: z.number(),
        south: z.number(),
        east: z.number(),
        north: z.number(),
      })
      .nullable()
      .optional(),
    /**
     * When true, skip the fast path and always run the agent path. The
     * client sets this on the retry after a zero-results fast response.
     */
    forceAgent: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.filters != null || d.prompt.trim().length >= 2,
    { message: "Provide `filters` or a prompt of at least 2 characters" },
  );

type StreamEvent =
  | { type: "parsed"; filters: NlFilterResult; summary: string }
  | {
      type: "viewport";
      bounds: { west: number; south: number; east: number; north: number };
      place: string | null;
    }
  | { type: "status"; message: string }
  | {
      type: "results";
      entities: PlanningApplicationEntity[];
      total: number;
      mode: "fast" | "agent";
    }
  | {
      type: "done";
      mode: "fast" | "agent";
      costGbp: number;
      tookMs: number;
    }
  | { type: "error"; message: string };

const COMPANY_SHAPED = /\b(ltd|limited|plc|llp|homes|holdings|group|developments?|partners(hip)?|estates|properties|capital|investments?|trust|university|college|school)\b/i;

function hasCompanyShapedKeyword(keywords: string[]): boolean {
  return keywords.some((k) => COMPANY_SHAPED.test(k));
}

function toSseFrame(event: StreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

async function enrichTopN(
  entities: PlanningApplicationEntity[],
  n: number,
  ctx: { companyId: string; userId?: string },
): Promise<PlanningApplicationEntity[]> {
  const subset = entities.slice(0, n);
  const results = await Promise.all(
    subset.map(async (e) => {
      if (!e.reference || !e.entity) return e;
      const hasName = Boolean(
        e.enrichment?.applicantName || e.enrichment?.agentName,
      );
      const hasEmail = Boolean(
        e.enrichment?.applicantEmail || e.enrichment?.agentEmail,
      );
      if (hasName && hasEmail) return e;
      try {
        const bundle = await resolveOutreachContact({
          ctx,
          reference: e.reference,
          planningEntity: e.entity,
          organisationEntity: e["organisation-entity"] ?? null,
          siteAddress: e["address-text"] ?? null,
        });
        if (!bundle.enrichment) return e;
        return {
          ...e,
          enrichment: {
            applicantName: bundle.enrichment.applicantName ?? null,
            applicantEmail: bundle.enrichment.applicantEmail ?? null,
            companyName: e.enrichment?.companyName ?? null,
            agentName: bundle.enrichment.agentName ?? null,
            agentAddress: bundle.enrichment.agentAddress ?? null,
            agentEmail: bundle.enrichment.agentEmail ?? null,
            source: (bundle.sources ?? []).join("+") || "enrichment",
            confidence: bundle.confidence,
          },
        } satisfies PlanningApplicationEntity;
      } catch {
        return e;
      }
    }),
  );
  return [...results, ...entities.slice(n)];
}

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const rate = await checkRateLimit("aiDeepSearch", ctx.company.id);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterMs);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid request",
        issues: parsed.error.flatten(),
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const { prompt, currentBounds, forceAgent, filters: bodyFilters } =
    parsed.data;
  const started = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (e: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(toSseFrame(e)));
        } catch {
          /* controller might already be closed */
        }
      };

      let totalCostGbp = 0;
      let mode: "fast" | "agent" = "fast";

      try {
        let filters: NlFilterResult;

        if (bodyFilters) {
          send({ type: "status", message: "Applying your filters…" });
          filters = bodyFilters;
          send({ type: "parsed", filters, summary: filters.summary });
          logger.info(
            {
              deepSearchStep: "parsed_filters_only",
              locationHint: filters.locationHint,
              statuses: filters.statuses,
              keywords: filters.keywords,
              applicantLike: filters.applicantLike,
              indexedSinceYear: filters.indexedSinceYear,
            },
            "deep_search_parsed",
          );
        } else {
          send({ type: "status", message: "Understanding your request…" });

          const parseRes = await parseNlSearch({
            prompt: prompt.trim(),
            companyId: ctx.company.id,
            userId: ctx.user?.id ?? null,
          });
          filters = parseRes.data;
          totalCostGbp += parseRes.costGbp;
          send({ type: "parsed", filters, summary: filters.summary });
          logger.info(
            {
              deepSearchStep: "parsed",
              prompt: prompt.trim(),
              locationHint: filters.locationHint,
              statuses: filters.statuses,
              keywords: filters.keywords,
              applicantLike: filters.applicantLike,
              indexedSinceYear: filters.indexedSinceYear,
            },
            "deep_search_parsed",
          );
        }

        let bounds =
          currentBounds ?? null;
        let placeLabel: string | null = null;

        if (filters.locationHint) {
          send({
            type: "status",
            message: `Locating ${filters.locationHint}…`,
          });
          const geo: GeocodeViewport | null = await geocodePlace(
            filters.locationHint,
          );
          if (geo) {
            bounds = geo.bounds;
            placeLabel = geo.formatted;
            send({
              type: "viewport",
              bounds: geo.bounds,
              place: geo.formatted,
            });
            logger.info(
              {
                deepSearchStep: "geocoded",
                locationHint: filters.locationHint,
                place: geo.formatted,
                bounds: geo.bounds,
              },
              "deep_search_geocoded",
            );
          } else {
            // Geocoder couldn't (or isn't allowed to) resolve the place name.
            // Don't silently fall back to the current viewport — the user
            // explicitly asked for a specific area, so surface the problem
            // instead of returning irrelevant results.
            send({
              type: "error",
              message: `Couldn't find "${filters.locationHint}" on the map. Try a more specific place name (neighbourhood, road, or postcode).`,
            });
            send({
              type: "done",
              mode,
              costGbp: totalCostGbp,
              tookMs: Date.now() - started,
            });
            controller.close();
            return;
          }
        }

        if (!bounds) {
          send({
            type: "error",
            message:
              "No map area to search. Pan the map to the area you want, then try again.",
          });
          send({
            type: "done",
            mode,
            costGbp: totalCostGbp,
            tookMs: Date.now() - started,
          });
          controller.close();
          return;
        }

        // Break large viewports (e.g. whole boroughs) into a grid of small
        // searchable tiles so we can still answer "Approved applications in
        // Camden"-shaped queries. A single Planning Data query above the
        // per-request area cap either times out or returns nothing.
        // Cap high enough to cover the largest London borough (Bromley ≈ 150 km²
        // needs ~45 tiles). Anything above this is a genuine "narrow your query"
        // situation (e.g. whole counties).
        logger.info(
          {
            deepSearchStep: "bbox_ready",
            approxKm2: bboxAreaKm2(bounds.west, bounds.south, bounds.east, bounds.north),
            bounds,
          },
          "deep_search_bbox",
        );

        const runAgentPath =
          Boolean(forceAgent) ||
          Boolean(filters.applicantLike) ||
          hasCompanyShapedKeyword(filters.keywords);
        mode = runAgentPath ? "agent" : "fast";

        send({
          type: "status",
          message: placeLabel
            ? `Searching planning records in ${placeLabel}…`
            : "Searching planning records in this area…",
        });

        // Fast path: bbox search via PlanWire (full UK coverage with PostGIS)
        const pwApps = await fetchPlanwireApplicationsByBbox({
          west: bounds.west,
          south: bounds.south,
          east: bounds.east,
          north: bounds.north,
          limit: 100,
          filters: {
            statuses: filters.statuses.length ? filters.statuses : undefined,
            applicationTypes: filters.applicationTypes.length
              ? filters.applicationTypes
              : undefined,
            developmentTypes: filters.developmentTypes.length
              ? filters.developmentTypes
              : undefined,
            decisionDateFrom: filters.decisionFrom ?? undefined,
            decisionDateTo: filters.decisionTo ?? undefined,
            indexedSinceYear: filters.indexedSinceYear ?? undefined,
          },
        });
        let entities: PlanningApplicationEntity[] = pwApps.map(mapPlanwireToPlanningEntity);
        logger.info(
          {
            deepSearchStep: "fast_path_done",
            total: entities.length,
            placeLabel,
          },
          "deep_search_fast_path",
        );


        if (!runAgentPath) {
          entities = rankPlanningResultsByApplicantOrCompany(entities);
          send({
            type: "results",
            entities,
            total: entities.length,
            mode,
          });
          if (entities.length === 0) {
            logger.info(
              {
                deepSearchStep: "zero_result",
                place: placeLabel,
              },
              "deep_search_zero_result",
            );
            send({
              type: "error",
              message: placeLabel
                ? `No planning applications found for ${placeLabel}. Try broadening your search, removing filter chips, or choosing a different area.`
                : "No planning applications found in this area. Try panning the map or removing filter chips.",
            });
          }
          send({
            type: "done",
            mode,
            costGbp: totalCostGbp,
            tookMs: Date.now() - started,
          });
          controller.close();
          return;
        }

        const needle = filters.applicantLike ?? filters.keywords.join(" ");
        send({
          type: "status",
          message: needle
            ? `Enriching candidates for "${needle}"…`
            : "Enriching top candidates…",
        });

        entities = await enrichTopN(entities, 10, {
          companyId: ctx.company.id,
          userId: ctx.user?.id ?? undefined,
        });

        if (needle) {
          const pre = entities.length;
          const matches = countApplicantOrCompanyMatches(entities, needle);
          entities = rankPlanningResultsByApplicantOrCompany(entities, needle);
          send({
            type: "status",
            message:
              matches > 0
                ? `Prioritised ${matches} of ${pre} applications for "${needle}".`
                : `No applicant or company matches found for "${needle}" in this area; showing the closest planning results.`,
          });
        } else {
          entities = rankPlanningResultsByApplicantOrCompany(entities);
        }

        send({
          type: "results",
          entities,
          total: entities.length,
          mode,
        });
        send({
          type: "done",
          mode,
          costGbp: totalCostGbp,
          tookMs: Date.now() - started,
        });
        controller.close();
      } catch (err) {
        if (err instanceof PlanwireRateLimitedError) {
          logger.warn(
            { retryAfterMs: err.retryAfterMs, context: err.context },
            "deep_search_planwire_rate_limited",
          );
          send({
            type: "error",
            message:
              "A 429 error occurred — please try again later or contact support.",
          });
          send({
            type: "done",
            mode,
            costGbp: totalCostGbp,
            tookMs: Date.now() - started,
          });
          controller.close();
          return;
        }
        const message = mapErrorMessage(err);
        logger.error({ err }, "deep_search_failed");
        send({ type: "error", message });
        send({
          type: "done",
          mode,
          costGbp: totalCostGbp,
          tookMs: Date.now() - started,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

function mapErrorMessage(err: unknown): string {
  if (err instanceof AgentTierError) {
    return err.message;
  }
  if (err instanceof AgentBudgetError) {
    return err.message;
  }
  if (err instanceof AgentProviderError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Deep search failed. Please try again.";
}
