import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";

const updateSchema = z.object({
  aiEnabled: z.boolean().optional(),
  aiDailyBudgetGbp: z.number().min(0).max(1000).optional(),
  icp: z
    .object({
      description: z.string().min(3).max(2000),
      keywords: z.array(z.string()).max(50).optional(),
      preferredStatuses: z.array(z.string()).max(20).optional(),
      excludedKeywords: z.array(z.string()).max(50).optional(),
      minProjectValueGbp: z.number().int().positive().nullable().optional(),
      targetRefusals: z.boolean().optional(),
      appealServiceType: z.string().max(200).nullable().optional(),
    })
    .optional(),
});

export async function GET() {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findUnique({
    where: { id: ctx.company.id },
    select: {
      aiEnabled: true,
      aiDailyBudgetGbp: true,
      aiMonthlySpendGbp: true,
      aiSpendResetAt: true,
    },
  });
  const icp = await prisma.icpProfile.findUnique({
    where: { companyId: ctx.company.id },
  });

  const sinceYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const agg = await prisma.agentRun.aggregate({
    where: { companyId: ctx.company.id, createdAt: { gte: sinceYesterday } },
    _sum: { costGbp: true, totalTokens: true },
    _count: { _all: true },
  });

  return NextResponse.json({
    aiEnabled: company?.aiEnabled ?? true,
    aiDailyBudgetGbp: Number(company?.aiDailyBudgetGbp ?? 5),
    aiMonthlySpendGbp: Number(company?.aiMonthlySpendGbp ?? 0),
    today: {
      costGbp: Number(agg._sum.costGbp ?? 0),
      tokens: agg._sum.totalTokens ?? 0,
      runs: agg._count._all,
    },
    icp: icp
      ? {
          description: icp.description,
          keywords: icp.keywords,
          preferredStatuses: icp.preferredStatuses,
          excludedKeywords: icp.excludedKeywords,
          minProjectValueGbp: icp.minProjectValueGbp,
          targetRefusals: icp.targetRefusals,
          appealServiceType: icp.appealServiceType,
        }
      : null,
  });
}

export async function PUT(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { aiEnabled, aiDailyBudgetGbp, icp } = parsed.data;

  if (aiEnabled !== undefined || aiDailyBudgetGbp !== undefined) {
    await prisma.company.update({
      where: { id: ctx.company.id },
      data: {
        aiEnabled: aiEnabled ?? undefined,
        aiDailyBudgetGbp: aiDailyBudgetGbp ?? undefined,
      },
    });
  }

  if (icp) {
    await prisma.icpProfile.upsert({
      where: { companyId: ctx.company.id },
      create: {
        companyId: ctx.company.id,
        description: icp.description,
        keywords: icp.keywords ?? [],
        preferredStatuses: icp.preferredStatuses ?? [],
        excludedKeywords: icp.excludedKeywords ?? [],
        minProjectValueGbp: icp.minProjectValueGbp ?? null,
        targetRefusals: icp.targetRefusals ?? false,
        appealServiceType: icp.appealServiceType?.trim() || null,
      },
      update: {
        description: icp.description,
        keywords: icp.keywords ?? [],
        preferredStatuses: icp.preferredStatuses ?? [],
        excludedKeywords: icp.excludedKeywords ?? [],
        minProjectValueGbp: icp.minProjectValueGbp ?? null,
        targetRefusals: icp.targetRefusals ?? false,
        appealServiceType: icp.appealServiceType?.trim() || null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
