import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  isPipelineStage,
  PIPELINE_ASSIGNEE_SELECT,
  serializePipelineLeadWithEnrichment,
} from "@/lib/pipeline";
import { sendPipelineAssignmentEmail } from "@/lib/email";
import { captureServerEvent } from "@/lib/posthog-server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  stage: z.string().optional(),
  notes: z.string().max(2000).nullable().optional(),
  lostReason: z.string().max(500).nullable().optional(),
  includeBallparkInOutreach: z.boolean().optional(),
  estimateMinGbp: z.number().int().min(0).nullable().optional(),
  estimateMaxGbp: z.number().int().min(0).nullable().optional(),
  estimateWeeks: z.number().min(0).max(520).nullable().optional(),
  assignedUserId: z.string().min(1).nullable().optional(),
});

export async function GET(_req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const lead = await prisma.pipelineLead.findUnique({
    where: { id },
    include: { assignedUser: { select: PIPELINE_ASSIGNEE_SELECT } },
  });
  if (!lead || lead.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ lead: await serializePipelineLeadWithEnrichment(lead) });
}

export async function PATCH(req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const lead = await prisma.pipelineLead.findUnique({
    where: { id },
    include: { assignedUser: { select: PIPELINE_ASSIGNEE_SELECT } },
  });
  if (!lead || lead.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data: {
    stage?: string;
    stageUpdatedAt?: Date;
    notes?: string | null;
    lostReason?: string | null;
    includeBallparkInOutreach?: boolean;
    estimateMinGbp?: number | null;
    estimateMaxGbp?: number | null;
    estimateWeeks?: number | null;
    assignedUserId?: string | null;
    assignedAt?: Date | null;
    assignedById?: string | null;
  } = {};

  if (parsed.data.stage !== undefined) {
    if (!isPipelineStage(parsed.data.stage)) {
      return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }
    data.stage = parsed.data.stage;
    data.stageUpdatedAt = new Date();
  }
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
  if (parsed.data.lostReason !== undefined) {
    data.lostReason = parsed.data.lostReason;
  }
  if (parsed.data.includeBallparkInOutreach !== undefined) {
    data.includeBallparkInOutreach = parsed.data.includeBallparkInOutreach;
  }
  if (parsed.data.estimateMinGbp !== undefined) {
    data.estimateMinGbp = parsed.data.estimateMinGbp;
  }
  if (parsed.data.estimateMaxGbp !== undefined) {
    data.estimateMaxGbp = parsed.data.estimateMaxGbp;
  }
  if (parsed.data.estimateWeeks !== undefined) {
    data.estimateWeeks = parsed.data.estimateWeeks;
  }

  let assigneeToNotify: {
    id: string;
    name: string | null;
    email: string | null;
  } | null = null;

  if (parsed.data.assignedUserId !== undefined) {
    const nextAssigneeId = parsed.data.assignedUserId;
    if (nextAssigneeId === lead.assignedUserId) {
      // no-op
    } else if (nextAssigneeId == null) {
      data.assignedUserId = null;
      data.assignedAt = null;
      data.assignedById = null;
    } else {
      const membership = await prisma.membership.findUnique({
        where: {
          userId_companyId: {
            userId: nextAssigneeId,
            companyId: ctx.company.id,
          },
        },
        include: {
          user: { select: PIPELINE_ASSIGNEE_SELECT },
        },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "Assignee must be a member of this workspace." },
          { status: 400 },
        );
      }
      data.assignedUserId = nextAssigneeId;
      data.assignedAt = new Date();
      data.assignedById = ctx.user.id;
      if (nextAssigneeId !== ctx.user.id) {
        assigneeToNotify = membership.user;
      }
    }
  }

  if (
    data.estimateMinGbp != null &&
    data.estimateMaxGbp != null &&
    data.estimateMinGbp > data.estimateMaxGbp
  ) {
    return NextResponse.json(
      { error: "estimateMinGbp cannot exceed estimateMaxGbp" },
      { status: 400 },
    );
  }

  const updated = await prisma.pipelineLead.update({
    where: { id },
    data,
    include: { assignedUser: { select: PIPELINE_ASSIGNEE_SELECT } },
  });

  if (assigneeToNotify?.email) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
    await sendPipelineAssignmentEmail({
      to: assigneeToNotify.email,
      assigneeName: assigneeToNotify.name ?? "there",
      assignerName: ctx.user.name ?? ctx.user.email ?? "A teammate",
      companyName: ctx.company.name,
      applicationRef: updated.applicationRef,
      siteAddress: updated.siteAddress,
      pipelineUrl: `${baseUrl}/app/pipeline?lead=${updated.id}`,
    });
    await captureServerEvent({
      distinctId: ctx.user.id,
      event: "pipeline_lead_assigned",
      properties: {
        company_id: ctx.company.id,
        lead_id: updated.id,
        assigned_user_id: assigneeToNotify.id,
      },
    });
  }

  if (data.stage && data.stage !== lead.stage) {
    await captureServerEvent({
      distinctId: ctx.user.id,
      event: "pipeline_stage_changed",
      properties: {
        company_id: ctx.company.id,
        lead_id: updated.id,
        stage: data.stage,
        previous_stage: lead.stage,
      },
    });
    if (data.stage === "won") {
      await captureServerEvent({
        distinctId: ctx.user.id,
        event: "pipeline_won",
        properties: {
          company_id: ctx.company.id,
          lead_id: updated.id,
        },
      });
    }
    if (data.stage === "lost") {
      await captureServerEvent({
        distinctId: ctx.user.id,
        event: "pipeline_lost",
        properties: {
          company_id: ctx.company.id,
          lead_id: updated.id,
          lost_reason: updated.lostReason,
        },
      });
    }
  }

  return NextResponse.json({
    lead: await serializePipelineLeadWithEnrichment(updated),
  });
}
