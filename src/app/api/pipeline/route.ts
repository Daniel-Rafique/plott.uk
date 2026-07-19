import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  PIPELINE_STAGES,
  PIPELINE_ASSIGNEE_SELECT,
  serializePipelineLeadFromRecord,
  serializePipelineLeadWithEnrichment,
  upsertPipelineLead,
  fetchEnrichmentMapForLeads,
  fetchPipelinePage,
  parsePipelineSearchParams,
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
  const assignee = url.searchParams.get("assignee");
  const page = url.searchParams.get("page");
  const pageSize = url.searchParams.get("pageSize");

  const query = parsePipelineSearchParams(
    {
      stage: stage ?? undefined,
      assignee: assignee ?? undefined,
      page: page ?? undefined,
      pageSize: pageSize ?? undefined,
    },
    { companyId: ctx.company.id, currentUserId: ctx.user.id },
  );

  const result = await fetchPipelinePage(query);

  return NextResponse.json({
    stages: PIPELINE_STAGES,
    leads: result.leads,
    meta: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      stageCounts: result.stageCounts,
      stage: result.query.stage,
      assignee: result.query.assignee,
    },
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
