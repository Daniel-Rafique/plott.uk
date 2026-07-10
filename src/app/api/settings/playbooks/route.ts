import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  getTradePlaybook,
  TRADE_PLAYBOOKS,
} from "@/lib/trade-playbooks";
import { captureServerEvent } from "@/lib/posthog-server";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    playbooks: TRADE_PLAYBOOKS.map((p) => ({
      id: p.id,
      name: p.name,
      summary: p.summary,
      suggestedFilterKeywords: p.suggestedFilterKeywords,
    })),
  });
}

const applySchema = z.object({
  playbookId: z.string(),
});

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const playbook = getTradePlaybook(parsed.data.playbookId);
  if (!playbook) {
    return NextResponse.json({ error: "Unknown playbook" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.icpProfile.upsert({
      where: { companyId: ctx.company.id },
      create: {
        companyId: ctx.company.id,
        description: playbook.icp.description,
        keywords: playbook.icp.keywords,
        excludedKeywords: playbook.icp.excludedKeywords,
        preferredStatuses: playbook.icp.preferredStatuses,
        minProjectValueGbp: playbook.icp.minProjectValueGbp,
        targetRefusals: playbook.icp.targetRefusals,
        appealServiceType: playbook.icp.appealServiceType,
      },
      update: {
        description: playbook.icp.description,
        keywords: playbook.icp.keywords,
        excludedKeywords: playbook.icp.excludedKeywords,
        preferredStatuses: playbook.icp.preferredStatuses,
        minProjectValueGbp: playbook.icp.minProjectValueGbp,
        targetRefusals: playbook.icp.targetRefusals,
        appealServiceType: playbook.icp.appealServiceType,
      },
    });

    await tx.letterTemplate.updateMany({
      where: { companyId: ctx.company.id, isDefault: true, kind: "outreach" },
      data: { isDefault: false },
    });

    await tx.letterTemplate.create({
      data: {
        companyId: ctx.company.id,
        name: playbook.letterTemplate.name,
        subject: playbook.letterTemplate.subject,
        bodyHtml: playbook.letterTemplate.bodyHtml,
        kind: playbook.icp.targetRefusals ? "appeal_pitch" : "outreach",
        isDefault: true,
      },
    });

    await tx.companyRateCard.upsert({
      where: { companyId: ctx.company.id },
      create: {
        companyId: ctx.company.id,
        dayRateGbp: playbook.rateCard.dayRateGbp,
        crewSizeDefault: playbook.rateCard.crewSizeDefault,
        unitRatesJson: playbook.rateCard.unitRates,
        typicalWeeksJson: playbook.rateCard.typicalWeeks,
        contingencyPercent: playbook.rateCard.contingencyPercent,
        vatInclusive: playbook.rateCard.vatInclusive,
      },
      update: {
        dayRateGbp: playbook.rateCard.dayRateGbp,
        crewSizeDefault: playbook.rateCard.crewSizeDefault,
        unitRatesJson: playbook.rateCard.unitRates,
        typicalWeeksJson: playbook.rateCard.typicalWeeks,
        contingencyPercent: playbook.rateCard.contingencyPercent,
        vatInclusive: playbook.rateCard.vatInclusive,
      },
    });
  });

  await captureServerEvent({
    distinctId: ctx.user.id,
    event: "trade_playbook_applied",
    properties: {
      company_id: ctx.company.id,
      playbook_id: playbook.id,
    },
  });

  return NextResponse.json({
    ok: true,
    playbookId: playbook.id,
    suggestedFilterKeywords: playbook.suggestedFilterKeywords,
    icp: playbook.icp,
  });
}
