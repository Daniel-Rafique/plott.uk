import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const rateCardSchema = z.object({
  dayRateGbp: z.number().min(0).max(10_000).nullable().optional(),
  crewSizeDefault: z.number().int().min(1).max(50).nullable().optional(),
  unitRates: z.record(z.string(), z.number().min(0).max(1_000_000)).optional(),
  typicalWeeks: z.record(z.string(), z.number().min(0).max(520)).optional(),
  contingencyPercent: z.number().min(0).max(50).optional(),
  vatInclusive: z.boolean().optional(),
});

function serialize(row: {
  id: string;
  companyId: string;
  dayRateGbp: number | null;
  crewSizeDefault: number | null;
  unitRatesJson: unknown;
  typicalWeeksJson: unknown;
  contingencyPercent: number;
  vatInclusive: boolean;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    companyId: row.companyId,
    dayRateGbp: row.dayRateGbp,
    crewSizeDefault: row.crewSizeDefault,
    unitRates: (row.unitRatesJson as Record<string, number>) ?? {},
    typicalWeeks: (row.typicalWeeksJson as Record<string, number>) ?? {},
    contingencyPercent: row.contingencyPercent,
    vatInclusive: row.vatInclusive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.companyRateCard.findUnique({
    where: { companyId: ctx.company.id },
  });
  return NextResponse.json({ rateCard: row ? serialize(row) : null });
}

export async function PUT(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = rateCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = {
    dayRateGbp: parsed.data.dayRateGbp ?? null,
    crewSizeDefault: parsed.data.crewSizeDefault ?? null,
    unitRatesJson: parsed.data.unitRates ?? {},
    typicalWeeksJson: parsed.data.typicalWeeks ?? {},
    contingencyPercent: parsed.data.contingencyPercent ?? 10,
    vatInclusive: parsed.data.vatInclusive ?? false,
  };

  const row = await prisma.companyRateCard.upsert({
    where: { companyId: ctx.company.id },
    create: { companyId: ctx.company.id, ...data },
    update: data,
  });

  return NextResponse.json({ rateCard: serialize(row) });
}
