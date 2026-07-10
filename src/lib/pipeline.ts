/**
 * Thin sales pipeline for planning leads. Stages are plain strings
 * (matching the rest of the schema); validated in application code.
 */

import type { PipelineLead, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { captureServerEvent } from "@/lib/posthog-server";
import { planningEntityToNumber } from "@/lib/planning-entity-bigint";

export const PIPELINE_STAGES = [
  "new",
  "contacted",
  "replied",
  "visit_booked",
  "quoted",
  "won",
  "lost",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  visit_booked: "Visit booked",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

export function isPipelineStage(value: string): value is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

export type UpsertPipelineLeadInput = {
  companyId: string;
  planningEntity: number | bigint;
  applicationRef?: string | null;
  siteAddress?: string | null;
  description?: string | null;
  /** If set, advances stage when current is earlier (e.g. send → contacted). */
  stage?: PipelineStage;
  letterId?: string | null;
  agentApprovalId?: string | null;
  notes?: string | null;
};

const STAGE_ORDER: Record<PipelineStage, number> = {
  new: 0,
  contacted: 1,
  replied: 2,
  visit_booked: 3,
  quoted: 4,
  won: 5,
  lost: 5,
};

function shouldAdvance(current: string, next: PipelineStage): boolean {
  if (!isPipelineStage(current)) return true;
  if (current === "won" || current === "lost") return false;
  if (next === "lost" || next === "won") return true;
  return STAGE_ORDER[next] > STAGE_ORDER[current];
}

export async function upsertPipelineLead(
  input: UpsertPipelineLeadInput,
): Promise<PipelineLead> {
  const planningEntity = BigInt(input.planningEntity);
  const existing = await prisma.pipelineLead.findUnique({
    where: {
      companyId_planningEntity: {
        companyId: input.companyId,
        planningEntity,
      },
    },
  });

  if (!existing) {
    return prisma.pipelineLead.create({
      data: {
        companyId: input.companyId,
        planningEntity,
        applicationRef: input.applicationRef ?? null,
        siteAddress: input.siteAddress ?? null,
        description: input.description ?? null,
        stage: input.stage ?? "new",
        stageUpdatedAt: new Date(),
        letterId: input.letterId ?? null,
        agentApprovalId: input.agentApprovalId ?? null,
        notes: input.notes ?? null,
      },
    });
  }

  const data: Prisma.PipelineLeadUpdateInput = {};
  if (input.applicationRef != null) data.applicationRef = input.applicationRef;
  if (input.siteAddress != null) data.siteAddress = input.siteAddress;
  if (input.description != null) data.description = input.description;
  if (input.letterId != null) data.letter = { connect: { id: input.letterId } };
  if (input.agentApprovalId != null) {
    data.agentApproval = { connect: { id: input.agentApprovalId } };
  }
  if (input.notes != null) data.notes = input.notes;
  if (input.stage && shouldAdvance(existing.stage, input.stage)) {
    data.stage = input.stage;
    data.stageUpdatedAt = new Date();
  }

  return prisma.pipelineLead.update({
    where: { id: existing.id },
    data,
  });
}

export async function markPipelineContactedFromLetter(args: {
  companyId: string;
  letterId: string;
  planningEntity: number | bigint | null;
  applicationRef?: string | null;
  siteAddress?: string | null;
  distinctId?: string;
}): Promise<PipelineLead | null> {
  if (args.planningEntity == null) return null;
  const lead = await upsertPipelineLead({
    companyId: args.companyId,
    planningEntity: args.planningEntity,
    applicationRef: args.applicationRef,
    siteAddress: args.siteAddress,
    stage: "contacted",
    letterId: args.letterId,
  });
  if (args.distinctId) {
    await captureServerEvent({
      distinctId: args.distinctId,
      event: "pipeline_stage_changed",
      properties: {
        company_id: args.companyId,
        lead_id: lead.id,
        stage: "contacted",
        source: "letter_sent",
      },
    });
  }
  return lead;
}

export async function markPipelineContactedFromApproval(args: {
  companyId: string;
  agentApprovalId: string;
  planningEntity: number | bigint | null;
  applicationRef?: string | null;
  siteAddress?: string | null;
  distinctId?: string;
}): Promise<PipelineLead | null> {
  if (args.planningEntity == null) return null;
  const lead = await upsertPipelineLead({
    companyId: args.companyId,
    planningEntity: args.planningEntity,
    applicationRef: args.applicationRef,
    siteAddress: args.siteAddress,
    stage: "contacted",
    agentApprovalId: args.agentApprovalId,
  });
  if (args.distinctId) {
    await captureServerEvent({
      distinctId: args.distinctId,
      event: "pipeline_stage_changed",
      properties: {
        company_id: args.companyId,
        lead_id: lead.id,
        stage: "contacted",
        source: "email_sent",
      },
    });
  }
  return lead;
}

export function serializePipelineLead(lead: PipelineLead) {
  return {
    id: lead.id,
    companyId: lead.companyId,
    planningEntity: planningEntityToNumber(lead.planningEntity),
    applicationRef: lead.applicationRef,
    siteAddress: lead.siteAddress,
    description: lead.description,
    stage: lead.stage,
    stageUpdatedAt: lead.stageUpdatedAt.toISOString(),
    notes: lead.notes,
    lostReason: lead.lostReason,
    letterId: lead.letterId,
    agentApprovalId: lead.agentApprovalId,
    estimateMinGbp: lead.estimateMinGbp,
    estimateMaxGbp: lead.estimateMaxGbp,
    estimateWeeks: lead.estimateWeeks,
    estimateJson: lead.estimateJson,
    estimatedAt: lead.estimatedAt?.toISOString() ?? null,
    includeBallparkInOutreach: lead.includeBallparkInOutreach,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

export const BALLPARK_DISCLAIMER =
  "This is an indicative ballpark based on similar projects and is not a formal quotation. A site survey is required before any price is confirmed.";

export const BALLPARK_CONFIDENCE_THRESHOLD = 0.55;

export function formatBallparkRange(minGbp: number, maxGbp: number): string {
  const fmt = (n: number) =>
    `£${Math.round(n).toLocaleString("en-GB")}`;
  if (minGbp === maxGbp) return fmt(minGbp);
  return `${fmt(minGbp)}–${fmt(maxGbp)}`;
}

export function formatBallparkWeeks(weeks: number): string {
  const rounded = Math.round(weeks * 10) / 10;
  if (rounded === 1) return "about 1 week";
  return `about ${rounded} weeks`;
}
