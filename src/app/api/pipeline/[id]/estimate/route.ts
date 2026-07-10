import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getCompanyTier, isAgentKindAllowed } from "@/lib/ai/tiers";
import {
  estimateJob,
  persistEstimateOnLead,
} from "@/lib/ai/agents/job-estimator";
import { serializePipelineLead } from "@/lib/pipeline";
import { planningEntityToNumber } from "@/lib/planning-entity-bigint";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  areaSqm: z.number().min(1).max(50_000).optional(),
  storeys: z.number().int().min(1).max(50).optional(),
  complexity: z.enum(["low", "medium", "high"]).optional(),
  regenerate: z.boolean().optional(),
});

export async function POST(req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tier = getCompanyTier(ctx.company);
  if (!isAgentKindAllowed(tier, "job_estimator")) {
    return NextResponse.json(
      { error: "Job estimator requires Pro or Agency." },
      { status: 403 },
    );
  }
  if (!ctx.company.aiEnabled) {
    return NextResponse.json({ error: "AI is disabled for this workspace." }, { status: 403 });
  }

  const { id } = await context.params;
  let lead = await prisma.pipelineLead.findUnique({ where: { id } });
  if (!lead || lead.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const planningEntity = planningEntityToNumber(lead.planningEntity);
  if (planningEntity == null) {
    return NextResponse.json(
      { error: "Lead is missing a planning entity." },
      { status: 422 },
    );
  }

  try {
    const estimate = await estimateJob({
      ctx: { companyId: ctx.company.id, userId: ctx.user.id },
      candidate: {
        planningEntity,
        reference: lead.applicationRef ?? String(planningEntity),
        siteAddress: lead.siteAddress,
        description: lead.description,
      },
      overrides: {
        areaSqm: parsed.data.areaSqm,
        storeys: parsed.data.storeys,
        complexity: parsed.data.complexity,
      },
    });

    lead = await persistEstimateOnLead({
      leadId: lead.id,
      estimate,
      distinctId: ctx.user.id,
      regenerated: Boolean(lead.estimatedAt) || parsed.data.regenerate,
    });

    return NextResponse.json({
      lead: serializePipelineLead(lead),
      estimate: {
        ...estimate,
        disclaimer:
          "This is an indicative ballpark based on similar projects and is not a formal quotation. A site survey is required before any price is confirmed.",
      },
    });
  } catch (err) {
    logger.error({ err, leadId: id }, "job_estimator_failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Estimate failed" },
      { status: 500 },
    );
  }
}
