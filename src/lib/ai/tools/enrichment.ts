/**
 * Cache-aware enrichment tools. Let agents read and write the
 * `ApplicationEnrichment` table (already populated by the deterministic
 * cascade) rather than re-hitting the upstream providers.
 */

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const readEnrichmentCacheTool = tool({
  description:
    "Read any cached applicant/agent fields we've already resolved for a planning application. Prefer this first to avoid redundant upstream calls.",
  inputSchema: z.object({
    planningEntity: z
      .number()
      .int()
      .describe("Planning Data entity id (e.g. 42123456)."),
  }),
  execute: async ({ planningEntity }) => {
    const row = await prisma.applicationEnrichment.findUnique({
      where: { planningEntity: BigInt(planningEntity) },
    });
    if (!row || row.expiresAt < new Date()) return { found: false as const };
    return {
      found: true as const,
      applicationRef: row.applicationRef,
      applicantName: row.applicantName,
      applicantAddress: row.applicantAddress,
      applicantEmail: row.applicantEmail,
      applicantEmailSource: row.applicantEmailSource,
      applicantEmailConfidence: row.applicantEmailConfidence,
      applicantEmailStatus: row.applicantEmailStatus,
      agentName: row.agentName,
      agentAddress: row.agentAddress,
      agentPhone: row.agentPhone,
      agentEmail: row.agentEmail,
      agentEmailSource: row.agentEmailSource,
      agentEmailConfidence: row.agentEmailConfidence,
      agentEmailStatus: row.agentEmailStatus,
      caseOfficer: row.caseOfficer,
      ward: row.ward,
      source: row.source,
      confidence: row.confidence,
      fetchedAt: row.fetchedAt.toISOString(),
    };
  },
});

export const writeEnrichmentCacheTool = tool({
  description:
    "Persist resolved applicant/agent fields for later reuse. Only call this at the end of an enrichment run with your best consolidated values. Include only the fields you're confident about.",
  inputSchema: z.object({
    planningEntity: z.number().int(),
    applicationRef: z.string().nullable().optional(),
    applicantName: z.string().nullable().optional(),
    applicantAddress: z.string().nullable().optional(),
    applicantEmail: z.string().nullable().optional(),
    applicantEmailSource: z.string().nullable().optional(),
    applicantEmailConfidence: z.number().int().min(0).max(100).nullable().optional(),
    applicantEmailStatus: z.string().nullable().optional(),
    agentName: z.string().nullable().optional(),
    agentAddress: z.string().nullable().optional(),
    agentPhone: z.string().nullable().optional(),
    agentEmail: z.string().nullable().optional(),
    agentEmailSource: z.string().nullable().optional(),
    agentEmailConfidence: z.number().int().min(0).max(100).nullable().optional(),
    agentEmailStatus: z.string().nullable().optional(),
    caseOfficer: z.string().nullable().optional(),
    ward: z.string().nullable().optional(),
    source: z.enum(["agent", "planwire", "lpa_portal", "composite", "hunter"]),
    confidence: z.enum(["low", "medium", "high"]),
  }),
  execute: async (input) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await prisma.applicationEnrichment.upsert({
      where: { planningEntity: BigInt(input.planningEntity) },
      create: {
        planningEntity: BigInt(input.planningEntity),
        applicationRef: input.applicationRef ?? null,
        applicantName: input.applicantName ?? null,
        applicantAddress: input.applicantAddress ?? null,
        applicantEmail: input.applicantEmail ?? null,
        applicantEmailSource: input.applicantEmailSource ?? null,
        applicantEmailConfidence: input.applicantEmailConfidence ?? null,
        applicantEmailStatus: input.applicantEmailStatus ?? null,
        agentName: input.agentName ?? null,
        agentAddress: input.agentAddress ?? null,
        agentPhone: input.agentPhone ?? null,
        agentEmail: input.agentEmail ?? null,
        agentEmailSource: input.agentEmailSource ?? null,
        agentEmailConfidence: input.agentEmailConfidence ?? null,
        agentEmailStatus: input.agentEmailStatus ?? null,
        caseOfficer: input.caseOfficer ?? null,
        ward: input.ward ?? null,
        source: input.source,
        confidence: input.confidence,
        fetchedAt: now,
        expiresAt,
      },
      update: {
        applicationRef: input.applicationRef ?? undefined,
        applicantName: input.applicantName ?? undefined,
        applicantAddress: input.applicantAddress ?? undefined,
        applicantEmail: input.applicantEmail ?? undefined,
        applicantEmailSource: input.applicantEmailSource ?? undefined,
        applicantEmailConfidence: input.applicantEmailConfidence ?? undefined,
        applicantEmailStatus: input.applicantEmailStatus ?? undefined,
        agentName: input.agentName ?? undefined,
        agentAddress: input.agentAddress ?? undefined,
        agentPhone: input.agentPhone ?? undefined,
        agentEmail: input.agentEmail ?? undefined,
        agentEmailSource: input.agentEmailSource ?? undefined,
        agentEmailConfidence: input.agentEmailConfidence ?? undefined,
        agentEmailStatus: input.agentEmailStatus ?? undefined,
        caseOfficer: input.caseOfficer ?? undefined,
        ward: input.ward ?? undefined,
        source: input.source,
        confidence: input.confidence,
        fetchedAt: now,
        expiresAt,
      },
    });
    return { ok: true as const };
  },
});
