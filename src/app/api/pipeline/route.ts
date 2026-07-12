import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  isPipelineStage,
  PIPELINE_STAGES,
  PIPELINE_ASSIGNEE_SELECT,
  serializePipelineLeadFromRecord,
  serializePipelineLeadsWithEnrichment,
  serializePipelineLeadWithEnrichment,
  upsertPipelineLead,
  fetchEnrichmentMapForLeads,
} from "@/lib/pipeline";
import { planningEntityToDb } from "@/lib/planning-entity-bigint";

export const runtime = "nodejs";

const createSchema = z.object({
  planningEntity: z.number().int().positive(),
  applicationRef: z.string().max(120).nullable().optional(),
  siteAddress: z.string().max(500).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});

export async function GET(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const planningEntityParam = url.searchParams.get("planningEntity");
  if (planningEntityParam) {
    const planningEntity = planningEntityToDb(Number(planningEntityParam));
    if (planningEntity == null || !Number.isFinite(Number(planningEntityParam))) {
      return NextResponse.json({ error: "Invalid planningEntity" }, { status: 400 });
    }
    const lead = await prisma.pipelineLead.findFirst({
      where: { companyId: ctx.company.id, planningEntity },
      include: { assignedUser: { select: PIPELINE_ASSIGNEE_SELECT } },
    });
    return NextResponse.json({
      lead: lead ? await serializePipelineLeadWithEnrichment(lead) : null,
    });
  }

  const stage = url.searchParams.get("stage");
  const where: { companyId: string; stage?: string } = {
    companyId: ctx.company.id,
  };
  if (stage && stage !== "all") {
    if (!isPipelineStage(stage)) {
      return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }
    where.stage = stage;
  }

  const leads = await prisma.pipelineLead.findMany({
    where,
    orderBy: [{ stageUpdatedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { assignedUser: { select: PIPELINE_ASSIGNEE_SELECT } },
  });

  return NextResponse.json({
    stages: PIPELINE_STAGES,
    leads: await serializePipelineLeadsWithEnrichment(leads),
  });
}

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const lead = await upsertPipelineLead({
    companyId: ctx.company.id,
    planningEntity: parsed.data.planningEntity,
    applicationRef: parsed.data.applicationRef,
    siteAddress: parsed.data.siteAddress,
    description: parsed.data.description,
    stage: "new",
  });

  const enrichmentMap = await fetchEnrichmentMapForLeads([lead]);
  return NextResponse.json({
    lead: serializePipelineLeadFromRecord(
      lead,
      enrichmentMap.get(lead.planningEntity.toString()) ?? null,
    ),
  });
}
