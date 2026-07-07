/**
 * PlanWire tools. Wrap the existing `fetchPlanwireApplication` helper so the
 * agent can ask the API about a single planning application by reference.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  fetchPlanwireApplication,
  fetchPlanwireApplicationsByQuery,
  isPlanwireInCooldown,
  PlanwireRateLimitedError,
} from "@/lib/planwire";

export const planwireLookupTool = tool({
  description:
    "Look up a UK planning application in PlanWire by its council reference. Returns applicant, agent, address, status, decision, and portal URL when available. If PlanWire is rate-limited this returns { found: false, rateLimited: true } — in that case DO NOT stop; keep going with the other tools.",
  inputSchema: z.object({
    reference: z.string().min(1).describe("The council's planning reference, e.g. 2024/01234/FUL."),
    councilId: z
      .string()
      .nullable()
      .optional()
      .describe("PlanWire council slug (e.g. 'adu'); omit if unknown."),
    organisationEntity: z
      .union([z.string(), z.number()])
      .nullable()
      .optional()
      .describe("Planning Data organisation-entity id, used to auto-resolve the council."),
  }),
  execute: async ({ reference, councilId, organisationEntity }) => {
    if (isPlanwireInCooldown().cooldown) {
      return { found: false as const, rateLimited: true as const };
    }
    const app = await fetchPlanwireApplication({
      reference,
      councilId: councilId ?? null,
      organisationEntity: organisationEntity ?? null,
    });
    // If the helper returned null, it may be because a 429 tripped cooldown
    // mid-call — surface that so the agent keeps cascading.
    if (!app) {
      if (isPlanwireInCooldown().cooldown) {
        return { found: false as const, rateLimited: true as const };
      }
      return { found: false as const };
    }
    return {
      found: true as const,
      reference: app.reference,
      address: app.address,
      postcode: app.postcode,
      description: app.description,
      status: app.status,
      decision: app.decision,
      decisionDate: app.decisionDate,
      url: app.url,
      councilWebsite: app.councilWebsite ?? null,
      applicantName: app.applicant?.name ?? null,
      agentName: app.applicant?.agent ?? null,
      agentAddress: app.applicant?.agentAddress ?? null,
      applicantCompany: app.applicant?.company ?? null,
      applicantNamesNotInFeed: app.applicantNamesNotInFeed ?? false,
    };
  },
});

export const planwireSearchTool = tool({
  description:
    "Search UK planning applications by keyword, council, postcode, status, type, or date range. Use for questions like 'recent applications in Camden' or 'refused householder extensions in OX1'. Returns a list of matches (reference, address, description, status, dates). For applicant/agent contact details on a specific result, follow up with planwireLookup.",
  inputSchema: z.object({
    q: z
      .string()
      .optional()
      .describe("Free-text across address, description, reference."),
    council: z.string().optional().describe("Council slug, e.g. 'camden'."),
    postcode: z.string().optional().describe("Postcode or prefix, e.g. 'OX1'."),
    status: z
      .enum(["Pending", "Approved", "Refused", "Withdrawn"])
      .optional(),
    type: z
      .string()
      .optional()
      .describe("Application type, e.g. 'Householder'."),
    dateFrom: z.string().optional().describe("Earliest date, YYYY-MM-DD."),
    dateTo: z.string().optional().describe("Latest date, YYYY-MM-DD."),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  execute: async (args) => {
    if (isPlanwireInCooldown().cooldown) {
      return {
        found: false as const,
        rateLimited: true as const,
        count: 0,
        results: [],
      };
    }
    try {
      const apps = await fetchPlanwireApplicationsByQuery(args);
      return {
        found: apps.length > 0,
        count: apps.length,
        results: apps.map((a) => ({
          id: a.id,
          reference: a.reference,
          councilId: a.councilId,
          address: a.address,
          postcode: a.postcode,
          description: a.description,
          status: a.status,
          decision: a.decision,
          decisionDate: a.decisionDate,
          url: a.url,
        })),
      };
    } catch (err) {
      if (err instanceof PlanwireRateLimitedError) {
        return {
          found: false as const,
          rateLimited: true as const,
          count: 0,
          results: [],
        };
      }
      throw err;
    }
  },
});
