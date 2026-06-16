/**
 * Agent tool wrapping the PlanWire bbox search so the deep-search agent can
 * query inside a viewport without going through the HTTP `/api/planning/search`
 * route. Preserves the output shape of the legacy Planning Data tool so
 * existing agent prompts keep working unchanged.
 */

import { tool } from "ai";
import { z } from "zod";
import { bboxTooLargeError } from "@/lib/planning-data";
import {
  fetchPlanwireApplicationsByBbox,
  mapPlanwireToPlanningEntity,
  PlanwireRateLimitedError,
} from "@/lib/planwire";

export const planningSearchByBboxTool = tool({
  description:
    "Search UK planning applications (powered by PlanWire) inside a bounding box. Returns up to 100 entities. Prefer narrow bboxes (neighbourhood-sized, under 0.0009 square degrees) or the call will be rejected.",
  inputSchema: z.object({
    west: z.number(),
    south: z.number(),
    east: z.number(),
    north: z.number(),
    statuses: z.array(z.string()).optional(),
    applicationTypes: z.array(z.string()).optional(),
    developmentTypes: z.array(z.string()).optional(),
    decisionDateFrom: z.string().nullable().optional(),
    decisionDateTo: z.string().nullable().optional(),
    indexedSinceYear: z.number().int().nullable().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  execute: async (args) => {
    const tooLarge = bboxTooLargeError(args.west, args.south, args.east, args.north);
    if (tooLarge) {
      return { ok: false as const, error: tooLarge, entities: [] };
    }
    try {
      const apps = await fetchPlanwireApplicationsByBbox({
        west: args.west,
        south: args.south,
        east: args.east,
        north: args.north,
        limit: args.limit ?? 50,
        filters: {
          statuses: args.statuses?.length ? args.statuses : undefined,
          applicationTypes: args.applicationTypes?.length
            ? args.applicationTypes
            : undefined,
          developmentTypes: args.developmentTypes?.length
            ? args.developmentTypes
            : undefined,
          decisionDateFrom: args.decisionDateFrom ?? undefined,
          decisionDateTo: args.decisionDateTo ?? undefined,
          indexedSinceYear: args.indexedSinceYear ?? undefined,
        },
      });
      const entities = apps.map(mapPlanwireToPlanningEntity);
      return {
        ok: true as const,
        count: entities.length,
        entities: entities.map((e) => ({
          entity: e.entity,
          reference: e.reference ?? null,
          address: e["address-text"] ?? null,
          description: e.description ?? null,
          status:
            e["planning-decision-type"] ??
            e["planning-application-status"] ??
            null,
          applicationType: e["planning-application-type"] ?? null,
          developmentType: e["development-type"] ?? null,
          decisionDate: e["decision-date"] ?? null,
          organisationEntity: null,
          councilId: e.councilId ?? null,
          point: e.point ?? null,
          sourceUrl: e.sourceUrl ?? null,
          applicantName: e.enrichment?.applicantName ?? null,
          agentName: e.enrichment?.agentName ?? null,
        })),
      };
    } catch (err) {
      if (err instanceof PlanwireRateLimitedError) {
        return {
          ok: false as const,
          error: "planwire_rate_limited",
          rateLimited: true as const,
          entities: [],
        };
      }
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "PlanWire search failed",
        entities: [],
      };
    }
  },
});
