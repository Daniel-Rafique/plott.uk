import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { trackKlaviyoEvent } from "@/lib/klaviyo-marketing";
import { captureServerEvent } from "@/lib/posthog-server";
import { lastSeenIdsToNumbers } from "@/lib/planning-entity-bigint";
import { clampBboxToSearchable } from "@/lib/planning-data";
import { getCompanyPlan } from "@/lib/pricing";
import { getCompanyPlanFeatures } from "@/lib/plan-features";

export const runtime = "nodejs";

type Body = {
  name?: string;
  bbox?: { west: number; south: number; east: number; north: number };
  filters?: Record<string, unknown>;
  frequency?: "daily" | "weekly";
  notifyEmails?: string[];
};

export async function GET() {
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
  const rows = await prisma.savedSearch.findMany({
    where: { companyId: ctx.company.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    searches: rows.map((s) => ({
      ...s,
      lastSeenIds: lastSeenIdsToNumbers(s.lastSeenIds),
    })),
  });
}

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canSaveSearches) {
    return NextResponse.json(
      {
        error: "Saved searches require the Pro plan or higher.",
        limit: features.savedSearchLimit,
        current: 0,
        upgrade: true,
        upgradeHref: features.upgradeHref,
      },
      { status: 403 },
    );
  }
  const name = (body.name ?? "").trim();
  if (!name)
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (
    !body.bbox ||
    [body.bbox.west, body.bbox.south, body.bbox.east, body.bbox.north].some(
      (v) => typeof v !== "number" || Number.isNaN(v),
    )
  ) {
    return NextResponse.json({ error: "Invalid bbox" }, { status: 400 });
  }

  const bbox = clampBboxToSearchable(body.bbox);
  const plan = getCompanyPlan(ctx.company);
  const currentCount = await prisma.savedSearch.count({
    where: { companyId: ctx.company.id },
  });

  if (currentCount >= plan.savedSearchLimit) {
    return NextResponse.json(
      {
        error: "Saved search limit reached",
        limit: plan.savedSearchLimit,
        current: currentCount,
        upgrade: true,
      },
      { status: 403 },
    );
  }

  const created = await prisma.savedSearch.create({
    data: {
      companyId: ctx.company.id,
      name,
      bbox,
      filters: (body.filters ?? {}) as object,
      frequency: body.frequency === "daily" ? "daily" : "weekly",
      notifyEmails:
        Array.isArray(body.notifyEmails) && body.notifyEmails.length
          ? body.notifyEmails.filter((e): e is string => typeof e === "string")
          : ctx.user.email
            ? [ctx.user.email]
            : [],
    },
  });
  await captureServerEvent({
    distinctId: ctx.user.email ?? ctx.user.id,
    event: "saved_search_created",
    properties: {
      search_id: created.id,
      company_id: ctx.company.id,
      frequency: created.frequency,
    },
  });
  if (ctx.user.email) {
    try {
      await trackKlaviyoEvent({
        email: ctx.user.email,
        event: "Saved Search Created",
        uniqueId: `saved-search-created:${created.id}`,
        properties: {
          search_id: created.id,
          company_id: ctx.company.id,
          company_name: ctx.company.name,
          frequency: created.frequency,
          notify_email_count: created.notifyEmails.length,
        },
      });
    } catch (err) {
      logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          searchId: created.id,
          companyId: ctx.company.id,
        },
        "klaviyo_saved_search_created_failed",
      );
    }
  }

  return NextResponse.json({
    search: {
      ...created,
      lastSeenIds: lastSeenIdsToNumbers(created.lastSeenIds),
    },
  });
}
