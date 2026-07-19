/**
 * Thin sales pipeline for planning leads. Stages are plain strings
 * (matching the rest of the schema); validated in application code.
 *
 * Server-only — client code must import from `@/lib/pipeline-shared`.
 */

import type { ApplicationEnrichment, PipelineLead, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { captureServerEvent } from "@/lib/posthog-server";
import { planningEntityToNumber } from "@/lib/planning-entity-bigint";
import {
  buildPipelineContactSummary,
  deriveShortWorkLabel,
  extractEstimateFields,
  extractWorkSnippetFromOutreachHtml,
  isUselessWorkLabel,
  type PipelineAssigneeUser,
  type PipelineLeadRow,
} from "@/lib/pipeline-display";
import {
  letterBodyHtml,
  type OutreachDraftDisplay,
} from "@/lib/outreach-draft-display";
import { decodeHtmlEntities } from "@/lib/utils";
import { parseEnrichmentPersonJson } from "@/lib/enrichment";
import {
  isPipelineStage,
  parsePipelinePage,
  parsePipelinePageSize,
  clampPipelinePage,
  pipelineListSkip,
  PIPELINE_STAGES,
  type PipelineAssigneeScope,
  type PipelinePageSize,
  type PipelineStage,
  type PipelineStageFilter,
} from "@/lib/pipeline-shared";

export {
  BALLPARK_CONFIDENCE_THRESHOLD,
  BALLPARK_DISCLAIMER,
  DEFAULT_PIPELINE_PAGE_SIZE,
  PIPELINE_PAGE_SIZES,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  clampPipelinePage,
  formatBallparkRange,
  formatBallparkWeeks,
  isPipelinePageSize,
  isPipelineStage,
  parsePipelinePage,
  parsePipelinePageSize,
  pipelineListSkip,
  pipelineTotalPages,
  type PipelineAssigneeScope,
  type PipelinePageSize,
  type PipelineStage,
  type PipelineStageFilter,
} from "@/lib/pipeline-shared";

export type UpsertPipelineLeadInput = {
  companyId: string;
  planningEntity: number | bigint;
  applicationRef?: string | null;
  siteAddress?: string | null;
  description?: string | null;
  /** Short human job label (e.g. "Roof safety guardrail"). */
  workLabel?: string | null;
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
        siteAddress: decodeHtmlEntities(input.siteAddress) ?? null,
        description: decodeHtmlEntities(input.description) ?? null,
        workLabel: input.workLabel ?? null,
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
  if (input.siteAddress != null) {
    data.siteAddress = decodeHtmlEntities(input.siteAddress);
  }
  if (input.description != null) {
    data.description = decodeHtmlEntities(input.description);
  }
  if (input.workLabel != null && !isUselessWorkLabel(input.workLabel)) {
    // Prefer a concrete letter/estimate label over empty or generic ones.
    if (!existing.workLabel || isUselessWorkLabel(existing.workLabel)) {
      data.workLabel = input.workLabel.trim();
    }
  }
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

/**
 * Persist a short work label on a lead. Letter-derived labels always win
 * over estimate placeholders; otherwise only fill when empty/useless.
 */
export async function setPipelineWorkLabel(args: {
  leadId: string;
  workLabel: string | null | undefined;
  force?: boolean;
}): Promise<void> {
  const label = args.workLabel?.trim();
  if (!label || isUselessWorkLabel(label)) return;

  const existing = await prisma.pipelineLead.findUnique({
    where: { id: args.leadId },
    select: { workLabel: true },
  });
  if (!existing) return;
  if (
    !args.force &&
    existing.workLabel &&
    !isUselessWorkLabel(existing.workLabel)
  ) {
    return;
  }

  await prisma.pipelineLead.update({
    where: { id: args.leadId },
    data: { workLabel: label },
  });
}

export async function setPipelineWorkLabelForEntity(args: {
  companyId: string;
  planningEntity: number | bigint;
  workLabel: string | null | undefined;
  force?: boolean;
}): Promise<void> {
  const label = args.workLabel?.trim();
  if (!label || isUselessWorkLabel(label)) return;

  const lead = await prisma.pipelineLead.findUnique({
    where: {
      companyId_planningEntity: {
        companyId: args.companyId,
        planningEntity: BigInt(args.planningEntity),
      },
    },
    select: { id: true, workLabel: true },
  });
  if (!lead) return;
  if (
    !args.force &&
    lead.workLabel &&
    !isUselessWorkLabel(lead.workLabel)
  ) {
    return;
  }

  await prisma.pipelineLead.update({
    where: { id: lead.id },
    data: { workLabel: label },
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

  const letter = await prisma.letter.findUnique({
    where: { id: args.letterId },
    select: { bodyHtml: true },
  });
  const workLabel = deriveShortWorkLabel({ letterHtml: letter?.bodyHtml });

  const lead = await upsertPipelineLead({
    companyId: args.companyId,
    planningEntity: args.planningEntity,
    applicationRef: args.applicationRef,
    siteAddress: args.siteAddress,
    stage: "contacted",
    letterId: args.letterId,
    workLabel,
  });
  if (workLabel) {
    await setPipelineWorkLabel({ leadId: lead.id, workLabel, force: true });
  }
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

  const approval = await prisma.agentApproval.findUnique({
    where: { id: args.agentApprovalId },
    select: { draftJson: true },
  });
  const workLabel = deriveShortWorkLabel({
    letterHtml: letterBodyHtml(approval?.draftJson as OutreachDraftDisplay),
  });

  const lead = await upsertPipelineLead({
    companyId: args.companyId,
    planningEntity: args.planningEntity,
    applicationRef: args.applicationRef,
    siteAddress: args.siteAddress,
    stage: "contacted",
    agentApprovalId: args.agentApprovalId,
    workLabel,
  });
  if (workLabel) {
    await setPipelineWorkLabel({ leadId: lead.id, workLabel, force: true });
  }
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

export const PIPELINE_ASSIGNEE_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

export type PipelineLeadWithAssignee = PipelineLead & {
  assignedUser?: PipelineAssigneeUser | null;
};

export type PipelineListQuery = {
  companyId: string;
  currentUserId: string;
  page: number;
  pageSize: PipelinePageSize;
  stage: PipelineStageFilter;
  assignee: PipelineAssigneeScope;
};

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export function parsePipelineSearchParams(
  raw: Record<string, string | string[] | undefined>,
  opts: { companyId: string; currentUserId: string },
): PipelineListQuery {
  const stageRaw = firstSearchParam(raw.stage);
  const stage: PipelineStageFilter =
    stageRaw && stageRaw !== "all" && isPipelineStage(stageRaw)
      ? stageRaw
      : "all";

  const assigneeRaw = firstSearchParam(raw.assignee);
  const assignee: PipelineAssigneeScope =
    !assigneeRaw || assigneeRaw.trim() === "" ? "me" : assigneeRaw;

  return {
    companyId: opts.companyId,
    currentUserId: opts.currentUserId,
    page: parsePipelinePage(firstSearchParam(raw.page)),
    pageSize: parsePipelinePageSize(firstSearchParam(raw.pageSize)),
    stage,
    assignee,
  };
}

/** Assignee filter only — used for stage counts that ignore the stage filter. */
export function buildPipelineAssigneeWhere(
  query: Pick<PipelineListQuery, "currentUserId" | "assignee">,
): Prisma.PipelineLeadWhereInput {
  if (query.assignee === "all") return {};
  if (query.assignee === "unassigned") return { assignedUserId: null };
  if (query.assignee === "me") {
    return { assignedUserId: query.currentUserId };
  }
  return { assignedUserId: query.assignee };
}

export function buildPipelineLeadWhere(
  query: PipelineListQuery,
): Prisma.PipelineLeadWhereInput {
  const where: Prisma.PipelineLeadWhereInput = {
    companyId: query.companyId,
    ...buildPipelineAssigneeWhere(query),
  };
  if (query.stage !== "all") {
    where.stage = query.stage;
  }
  return where;
}

export type PipelinePageResult = {
  leads: SerializedPipelineLead[];
  total: number;
  page: number;
  pageSize: PipelinePageSize;
  stageCounts: Record<string, number>;
  query: PipelineListQuery;
};

export async function fetchPipelinePage(
  query: PipelineListQuery,
): Promise<PipelinePageResult> {
  const listWhere = buildPipelineLeadWhere(query);
  const stageCountWhere: Prisma.PipelineLeadWhereInput = {
    companyId: query.companyId,
    ...buildPipelineAssigneeWhere(query),
  };

  const [total, stageGroups] = await Promise.all([
    prisma.pipelineLead.count({ where: listWhere }),
    prisma.pipelineLead.groupBy({
      by: ["stage"],
      where: stageCountWhere,
      _count: { _all: true },
    }),
  ]);

  const page = clampPipelinePage(query.page, total, query.pageSize);
  const skip = pipelineListSkip(page, query.pageSize);

  const leads = await prisma.pipelineLead.findMany({
    where: listWhere,
    orderBy: [{ stageUpdatedAt: "desc" }, { createdAt: "desc" }],
    skip,
    take: query.pageSize,
    include: { assignedUser: { select: PIPELINE_ASSIGNEE_SELECT } },
  });

  const stageCounts: Record<string, number> = { all: 0 };
  for (const stage of PIPELINE_STAGES) {
    stageCounts[stage] = 0;
  }
  for (const group of stageGroups) {
    const count = group._count._all;
    stageCounts.all += count;
    if (isPipelineStage(group.stage)) {
      stageCounts[group.stage] = count;
    }
  }

  return {
    leads: await serializePipelineLeadsWithEnrichment(leads),
    total,
    page,
    pageSize: query.pageSize,
    stageCounts,
    query: { ...query, page },
  };
}

export function enrichmentFromApplicationEnrichment(
  row: ApplicationEnrichment | null | undefined,
): SerializePipelineLeadArgs["enrichment"] | null {
  if (!row) return null;
  return {
    applicantName: row.applicantName,
    applicantAddress: row.applicantAddress,
    applicantEmail: row.applicantEmail,
    applicantEmailSource: row.applicantEmailSource,
    applicantEmailConfidence: row.applicantEmailConfidence,
    applicantEmailStatus: row.applicantEmailStatus,
    applicantPerson: parseEnrichmentPersonJson(row.applicantPersonJson),
    agentName: row.agentName,
    agentEmail: row.agentEmail,
    agentPerson: parseEnrichmentPersonJson(row.agentPersonJson),
  };
}

export async function fetchEnrichmentMapForLeads(
  leads: Pick<PipelineLead, "planningEntity">[],
): Promise<Map<string, NonNullable<SerializePipelineLeadArgs["enrichment"]>>> {
  const entities = [...new Set(leads.map((lead) => lead.planningEntity))];
  if (entities.length === 0) return new Map();

  const rows = await prisma.applicationEnrichment.findMany({
    where: { planningEntity: { in: entities } },
  });

  const map = new Map<string, NonNullable<SerializePipelineLeadArgs["enrichment"]>>();
  for (const row of rows) {
    const enrichment = enrichmentFromApplicationEnrichment(row);
    if (enrichment) {
      map.set(row.planningEntity.toString(), enrichment);
    }
  }
  return map;
}

export async function fetchOutreachSnippetsForLeads(
  leads: Pick<PipelineLead, "agentApprovalId">[],
): Promise<Map<string, string>> {
  const approvalIds = [
    ...new Set(
      leads
        .map((lead) => lead.agentApprovalId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (approvalIds.length === 0) return new Map();

  const approvals = await prisma.agentApproval.findMany({
    where: { id: { in: approvalIds } },
    select: { id: true, draftJson: true },
  });

  const map = new Map<string, string>();
  for (const approval of approvals) {
    const snippet = extractWorkSnippetFromOutreachHtml(
      letterBodyHtml(approval.draftJson as OutreachDraftDisplay),
    );
    if (snippet) map.set(approval.id, snippet);
  }
  return map;
}

export function serializePipelineLeadFromRecord(
  lead: PipelineLeadWithAssignee,
  enrichment?: SerializePipelineLeadArgs["enrichment"] | null,
  outreachSnippet?: string | null,
): SerializedPipelineLead {
  return serializePipelineLead({
    lead,
    assignedUser: lead.assignedUser ?? null,
    enrichment,
    outreachSnippet,
  });
}

export async function serializePipelineLeadsWithEnrichment(
  leads: PipelineLeadWithAssignee[],
): Promise<SerializedPipelineLead[]> {
  const [enrichmentMap, outreachSnippets] = await Promise.all([
    fetchEnrichmentMapForLeads(leads),
    fetchOutreachSnippetsForLeads(leads),
  ]);

  // Backfill missing/useless work labels from letter drafts or estimate scope.
  const backfills: Array<Promise<unknown>> = [];
  for (const lead of leads) {
    if (lead.workLabel && !isUselessWorkLabel(lead.workLabel)) continue;
    const snippet = lead.agentApprovalId
      ? outreachSnippets.get(lead.agentApprovalId) ?? null
      : null;
    const { workType, scopeSummary } = extractEstimateFields(lead.estimateJson);
    const derived = deriveShortWorkLabel({
      workType,
      scopeSummary,
      description: lead.description,
      outreachSnippet: snippet,
    });
    if (!derived) continue;
    lead.workLabel = derived;
    backfills.push(
      prisma.pipelineLead.update({
        where: { id: lead.id },
        data: { workLabel: derived },
      }),
    );
  }
  if (backfills.length > 0) {
    await Promise.allSettled(backfills);
  }

  return leads.map((lead) =>
    serializePipelineLeadFromRecord(
      lead,
      enrichmentMap.get(lead.planningEntity.toString()) ?? null,
      lead.agentApprovalId
        ? outreachSnippets.get(lead.agentApprovalId) ?? null
        : null,
    ),
  );
}

export async function serializePipelineLeadWithEnrichment(
  lead: PipelineLeadWithAssignee,
): Promise<SerializedPipelineLead> {
  const [enrichmentMap, outreachSnippets] = await Promise.all([
    fetchEnrichmentMapForLeads([lead]),
    fetchOutreachSnippetsForLeads([lead]),
  ]);
  return serializePipelineLeadFromRecord(
    lead,
    enrichmentMap.get(lead.planningEntity.toString()) ?? null,
    lead.agentApprovalId
      ? outreachSnippets.get(lead.agentApprovalId) ?? null
      : null,
  );
}

export type { PipelineLeadRow, PipelineAssigneeUser } from "@/lib/pipeline-display";

export type SerializedPipelineLead = PipelineLeadRow & {
  companyId: string;
  letterId: string | null;
  agentApprovalId: string | null;
  estimateJson: unknown;
  estimatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SerializePipelineLeadArgs = {
  lead: PipelineLead;
  assignedUser?: PipelineAssigneeUser | null;
  enrichment?: {
    applicantName?: string | null;
    applicantAddress?: string | null;
    applicantEmail?: string | null;
    applicantEmailSource?: string | null;
    applicantEmailConfidence?: number | null;
    applicantEmailStatus?: string | null;
    applicantPerson?: {
      position?: string | null;
      seniority?: string | null;
      employer?: string | null;
      linkedin?: string | null;
    } | null;
    agentName?: string | null;
    agentEmail?: string | null;
    agentPerson?: {
      position?: string | null;
      seniority?: string | null;
      employer?: string | null;
      linkedin?: string | null;
    } | null;
  } | null;
  outreachSnippet?: string | null;
};

export function serializePipelineLead({
  lead,
  assignedUser = null,
  enrichment = null,
  outreachSnippet = null,
}: SerializePipelineLeadArgs): SerializedPipelineLead {
  const { workType, scopeSummary } = extractEstimateFields(lead.estimateJson);
  const contact = buildPipelineContactSummary(enrichment);
  const workTypeLabel = deriveShortWorkLabel({
    workLabel: lead.workLabel,
    workType,
    scopeSummary,
    description: lead.description,
    outreachSnippet,
  });
  return {
    id: lead.id,
    companyId: lead.companyId,
    planningEntity: planningEntityToNumber(lead.planningEntity),
    applicationRef: lead.applicationRef,
    siteAddress: decodeHtmlEntities(lead.siteAddress),
    description: decodeHtmlEntities(lead.description),
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
    assignedUserId: lead.assignedUserId,
    assignedAt: lead.assignedAt?.toISOString() ?? null,
    assignedUser,
    workLabel: decodeHtmlEntities(lead.workLabel),
    workType,
    scopeSummary: decodeHtmlEntities(scopeSummary),
    workTypeLabel: decodeHtmlEntities(workTypeLabel),
    contact: {
      ...contact,
      applicantName: decodeHtmlEntities(contact.applicantName),
      applicantAddress: decodeHtmlEntities(contact.applicantAddress),
      agentName: decodeHtmlEntities(contact.agentName),
    },
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}
