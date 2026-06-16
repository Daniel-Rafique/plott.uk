import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { lastSeenIdsToNumbers } from "@/lib/planning-entity-bigint";
import { getCompanyPlanFeatures } from "@/lib/plan-features";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canSaveSearches) {
    return NextResponse.json(
      {
        error: "Saved searches require the Pro plan or higher.",
        upgrade: true,
        upgradeHref: features.upgradeHref,
      },
      { status: 403 },
    );
  }
  const { id } = await params;
  const row = await prisma.savedSearch.findUnique({ where: { id } });
  if (!row || row.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    search: {
      id: row.id,
      name: row.name,
      bbox: row.bbox,
      filters: row.filters,
      frequency: row.frequency,
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canSaveSearches) {
    return NextResponse.json(
      {
        error: "Saved searches require the Pro plan or higher.",
        upgrade: true,
        upgradeHref: features.upgradeHref,
      },
      { status: 403 },
    );
  }
  const { id } = await params;
  const existing = await prisma.savedSearch.findUnique({ where: { id } });
  if (!existing || existing.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.savedSearch.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canSaveSearches) {
    return NextResponse.json(
      {
        error: "Saved searches require the Pro plan or higher.",
        upgrade: true,
        upgradeHref: features.upgradeHref,
      },
      { status: 403 },
    );
  }
  const { id } = await params;
  const existing = await prisma.savedSearch.findUnique({ where: { id } });
  if (!existing || existing.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json()) as {
    name?: string;
    frequency?: "daily" | "weekly" | "monthly" | "quarterly";
    notifyEmails?: string[];
    autoOutreach?: boolean;
    autoApproveBelowConfidence?: number | null;
  };
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim())
    data.name = body.name.trim();
  if (["daily", "weekly", "monthly", "quarterly"].includes(body.frequency ?? ""))
    data.frequency = body.frequency;
  if (Array.isArray(body.notifyEmails))
    data.notifyEmails = body.notifyEmails.filter(
      (e) => typeof e === "string",
    );
  if (typeof body.autoOutreach === "boolean") {
    if (body.autoOutreach && !features.canUseAutoOutreach) {
      return NextResponse.json(
        {
          error: "Autonomous outreach requires the Agency plan.",
          upgrade: true,
          upgradeHref: features.upgradeHref,
        },
        { status: 403 },
      );
    }
    data.autoOutreach = body.autoOutreach;
  }
  if (
    body.autoApproveBelowConfidence === null ||
    (typeof body.autoApproveBelowConfidence === "number" &&
      body.autoApproveBelowConfidence >= 0 &&
      body.autoApproveBelowConfidence <= 1)
  ) {
    if (body.autoApproveBelowConfidence != null && !features.canUseAutoOutreach) {
      return NextResponse.json(
        {
          error: "Autonomous outreach requires the Agency plan.",
          upgrade: true,
          upgradeHref: features.upgradeHref,
        },
        { status: 403 },
      );
    }
    data.autoApproveBelowConfidence = body.autoApproveBelowConfidence;
  }
  const updated = await prisma.savedSearch.update({ where: { id }, data });
  return NextResponse.json({
    search: {
      ...updated,
      lastSeenIds: lastSeenIdsToNumbers(updated.lastSeenIds),
    },
  });
}
