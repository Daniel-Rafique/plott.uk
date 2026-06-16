import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { planningEntityToNumber } from "@/lib/planning-entity-bigint";
import { getCompanyPlanFeatures } from "@/lib/plan-features";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z
    .enum(["pending", "approved", "rejected", "sent", "all"])
    .default("pending"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    status: url.searchParams.get("status") ?? "pending",
    limit: url.searchParams.get("limit") ?? 25,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const rows = await prisma.agentApproval.findMany({
    where: {
      companyId: ctx.company.id,
      ...(parsed.data.status === "all"
        ? {}
        : { status: parsed.data.status }),
    },
    include: {
      agentRun: {
        select: { kind: true, model: true, costGbp: true, createdAt: true },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: parsed.data.limit,
  });

  const counts = await prisma.agentApproval.groupBy({
    by: ["status"],
    where: { companyId: ctx.company.id },
    _count: { _all: true },
  });

  return NextResponse.json({
    approvals: rows.map((r) => ({
      ...r,
      planningEntity: planningEntityToNumber(r.planningEntity),
    })),
    counts: Object.fromEntries(
      counts.map((c) => [c.status, c._count._all] as const),
    ),
  });
}
