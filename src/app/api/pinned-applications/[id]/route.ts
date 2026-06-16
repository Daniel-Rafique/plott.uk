import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  nextPinnedApplicationCheckAt,
  parsePinnedApplicationDate,
} from "@/lib/pinned-applications";
import { getCompanyPlanFeatures } from "@/lib/plan-features";

export const runtime = "nodejs";

function serializePinnedApplication(row: {
  id: string;
  reference: string;
  councilId: string | null;
  planningEntity: bigint | null;
  siteAddress: string | null;
  description: string | null;
  status: string | null;
  decision: string | null;
  decisionDate: string | null;
  targetDecisionDate: Date | null;
  sourceUrl: string | null;
  notifyEmails: string[];
  frequency: string;
  paused: boolean;
  lastCheckedAt: Date | null;
  lastNotifiedAt: Date | null;
  nextCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    planningEntity: row.planningEntity == null ? null : Number(row.planningEntity),
    targetDecisionDate: row.targetDecisionDate?.toISOString() ?? null,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastNotifiedAt: row.lastNotifiedAt?.toISOString() ?? null,
    nextCheckAt: row.nextCheckAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getOwnedPinnedApplication(id: string, companyId: string) {
  const row = await prisma.pinnedApplication.findUnique({ where: { id } });
  if (!row || row.companyId !== companyId) return null;
  return row;
}

function pinnedUpgradeResponse(features: ReturnType<typeof getCompanyPlanFeatures>) {
  return NextResponse.json(
    {
      error: "Pinned application tracking requires the Pro plan or higher.",
      upgrade: true,
      upgradeHref: features.upgradeHref,
    },
    { status: 403 },
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canPinApplications) return pinnedUpgradeResponse(features);
  const { id } = await params;
  const row = await getOwnedPinnedApplication(id, ctx.company.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ pinnedApplication: serializePinnedApplication(row) });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canPinApplications) return pinnedUpgradeResponse(features);
  const { id } = await params;
  const existing = await getOwnedPinnedApplication(id, ctx.company.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    notifyEmails?: string[];
    frequency?: "daily" | "weekly" | "monthly" | "quarterly";
    targetDecisionDate?: string | null;
    paused?: boolean;
  };
  const data: Record<string, unknown> = {};
  if (Array.isArray(body.notifyEmails)) {
    data.notifyEmails = Array.from(
      new Set(
        body.notifyEmails
          .filter((e): e is string => typeof e === "string" && e.includes("@"))
          .map((e) => e.trim().toLowerCase()),
      ),
    );
  }
  if (["daily", "weekly", "monthly", "quarterly"].includes(body.frequency ?? "")) {
    data.frequency = body.frequency;
  }
  if ("targetDecisionDate" in body) {
    data.targetDecisionDate = parsePinnedApplicationDate(body.targetDecisionDate);
  }
  if (typeof body.paused === "boolean") data.paused = body.paused;
  if ("frequency" in data || "targetDecisionDate" in data) {
    const targetDecisionDate =
      "targetDecisionDate" in data
        ? (data.targetDecisionDate as Date | null)
        : existing.targetDecisionDate;
    const frequency =
      typeof data.frequency === "string" ? data.frequency : existing.frequency;
    data.nextCheckAt = nextPinnedApplicationCheckAt({
      targetDecisionDate,
      status: existing.status,
      decision: existing.decision,
      fallbackFrequency: frequency,
    });
  }

  const updated = await prisma.pinnedApplication.update({
    where: { id },
    data,
  });
  return NextResponse.json({ pinnedApplication: serializePinnedApplication(updated) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await getOwnedPinnedApplication(id, ctx.company.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.pinnedApplication.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
