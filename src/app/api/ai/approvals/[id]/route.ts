/**
 * Approve/reject an AgentApproval. On approval for `outreach_letter`
 * approvals we also persist a `Letter` draft under the tenant so the
 * recipient can be sent a normal letter through the usual pipeline.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { planningEntityToNumber } from "@/lib/planning-entity-bigint";
import {
  ApprovalMaterializationError,
  materializeApprovalLetter,
} from "@/lib/agent-approvals";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import { scheduleLetterPdfEmailDelivery } from "@/lib/letter-delivery";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectionNote: z.string().max(500).optional(),
});

export async function PATCH(req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canUseAutoOutreach) {
    return NextResponse.json(
      {
        error: "Outreach approvals require the Agency plan.",
        upgrade: true,
        upgradeHref: features.upgradeHref,
      },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const approval = await prisma.agentApproval.findUnique({ where: { id } });
  if (!approval || approval.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return NextResponse.json(
      { error: `Already ${approval.status}` },
      { status: 409 },
    );
  }

  if (parsed.data.action === "reject") {
    const updated = await prisma.agentApproval.update({
      where: { id },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectionNote: parsed.data.rejectionNote ?? null,
        approvedById: ctx.user.id,
      },
    });
    return NextResponse.json({
      approval: {
        ...updated,
        planningEntity: planningEntityToNumber(updated.planningEntity),
      },
    });
  }

  try {
    const result = await materializeApprovalLetter({
      approval,
      userId: ctx.user.id,
      approvedById: ctx.user.id,
    });

    scheduleLetterPdfEmailDelivery({
      letterId: result.letter.id,
      autoPrint: false,
    });

    return NextResponse.json({
      approval: {
        ...result.approval,
        planningEntity: planningEntityToNumber(result.approval.planningEntity),
      },
      letterId: result.letter.id,
    });
  } catch (err) {
    if (err instanceof ApprovalMaterializationError) {
      return NextResponse.json(
        { error: err.message, issues: err.details },
        { status: err.status },
      );
    }
    throw err;
  }
}
