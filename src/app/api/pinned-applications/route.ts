import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getCompanyPlan } from "@/lib/pricing";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import {
  nextPinnedApplicationCheckAt,
  parsePinnedApplicationDate,
  snapshotFromPlanningEntity,
  snapshotFromPlanwireApplication,
} from "@/lib/pinned-applications";
import { fetchPlanwireApplication } from "@/lib/planwire";
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs";

type Body = {
  reference?: string;
  councilId?: string | null;
  planningEntity?: number | string | null;
  siteAddress?: string | null;
  description?: string | null;
  status?: string | null;
  decision?: string | null;
  decisionDate?: string | null;
  targetDecisionDate?: string | null;
  sourceUrl?: string | null;
  notifyEmails?: string[];
  frequency?: "daily" | "weekly" | "monthly" | "quarterly";
};

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

function cleanEmails(value: unknown, fallback: string | null | undefined): string[] {
  const emails = Array.isArray(value)
    ? value.filter((e): e is string => typeof e === "string" && e.includes("@"))
    : [];
  if (emails.length) return Array.from(new Set(emails.map((e) => e.trim().toLowerCase())));
  return fallback ? [fallback] : [];
}

export async function GET() {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canPinApplications) {
    return NextResponse.json({
      pinnedApplications: [],
      usage: {
        current: 0,
        limit: features.pinnedApplicationLimit,
        planName: features.planName,
      },
    });
  }

  const rows = await prisma.pinnedApplication.findMany({
    where: { companyId: ctx.company.id },
    orderBy: { createdAt: "desc" },
  });
  const plan = getCompanyPlan(ctx.company);

  return NextResponse.json({
    pinnedApplications: rows.map(serializePinnedApplication),
    usage: {
      current: rows.length,
      limit: plan.pinnedApplicationLimit,
      planName: plan.name,
    },
  });
}

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canPinApplications) {
    return NextResponse.json(
      {
        error: "Pinned application tracking requires the Pro plan or higher.",
        limit: features.pinnedApplicationLimit,
        current: 0,
        upgrade: true,
        upgradeHref: features.upgradeHref,
      },
      { status: 403 },
    );
  }

  const body = (await req.json()) as Body;
  const reference = (body.reference ?? "").trim();
  if (!reference) {
    return NextResponse.json({ error: "Reference is required" }, { status: 400 });
  }

  const councilId = body.councilId?.trim() || null;
  const existing = await prisma.pinnedApplication.findFirst({
    where: { companyId: ctx.company.id, reference, councilId },
  });
  if (existing) {
    return NextResponse.json({
      pinnedApplication: serializePinnedApplication(existing),
      alreadyPinned: true,
    });
  }

  const plan = getCompanyPlan(ctx.company);
  const currentCount = await prisma.pinnedApplication.count({
    where: { companyId: ctx.company.id },
  });
  if (currentCount >= plan.pinnedApplicationLimit) {
    return NextResponse.json(
      {
        error: "Pinned application limit reached",
        limit: plan.pinnedApplicationLimit,
        current: currentCount,
        upgrade: true,
        upgradeHref: features.upgradeHref,
      },
      { status: 403 },
    );
  }

  const seedSnapshot = snapshotFromPlanningEntity({
    entity: body.planningEntity == null ? undefined : Number(body.planningEntity),
    reference,
    councilId: councilId ?? undefined,
    "address-text": body.siteAddress ?? undefined,
    description: body.description ?? undefined,
    "planning-application-status": body.status ?? undefined,
    "planning-decision-type": body.decision ?? undefined,
    "decision-date": body.decisionDate ?? undefined,
    sourceUrl: body.sourceUrl ?? undefined,
  });
  const planwire = await fetchPlanwireApplication({ reference, councilId });
  const snapshot = planwire
    ? {
        ...seedSnapshot,
        ...snapshotFromPlanwireApplication(planwire),
        planningEntity: seedSnapshot.planningEntity,
      }
    : seedSnapshot;
  const targetDecisionDate = parsePinnedApplicationDate(body.targetDecisionDate);
  const now = new Date();
  const frequency = body.frequency ?? "daily";

  const created = await prisma.pinnedApplication.create({
    data: {
      companyId: ctx.company.id,
      userId: ctx.user.id,
      reference: snapshot.reference,
      councilId: snapshot.councilId,
      planningEntity:
        snapshot.planningEntity == null ? null : BigInt(snapshot.planningEntity),
      siteAddress: snapshot.siteAddress,
      description: snapshot.description,
      status: snapshot.status,
      decision: snapshot.decision,
      decisionDate: snapshot.decisionDate,
      targetDecisionDate,
      sourceUrl: snapshot.sourceUrl,
      notifyEmails: cleanEmails(body.notifyEmails, ctx.user.email),
      frequency,
      lastCheckedAt: now,
      nextCheckAt: nextPinnedApplicationCheckAt({
        now,
        targetDecisionDate,
        status: snapshot.status,
        decision: snapshot.decision,
        fallbackFrequency: frequency,
      }),
      lastSnapshotJson: snapshot as unknown as Prisma.InputJsonObject,
    },
  });

  getPostHogClient().capture({
    distinctId: ctx.user.email ?? ctx.user.id,
    event: "pinned_application_created",
    properties: {
      pinned_application_id: created.id,
      company_id: ctx.company.id,
      reference: created.reference,
      council_id: created.councilId,
    },
  });

  return NextResponse.json({
    pinnedApplication: serializePinnedApplication(created),
  });
}
