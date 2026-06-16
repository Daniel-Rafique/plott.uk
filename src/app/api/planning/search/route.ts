import { NextResponse } from "next/server";
import { bboxTooLargeError } from "@/lib/planning-data";
import {
  fetchPlanwireApplicationsByBbox,
  mapPlanwireToPlanningEntity,
  PlanwireRateLimitedError,
} from "@/lib/planwire";
import { requireSubscribedTenant } from "@/lib/tenant";
import { enrichSearchResults } from "@/lib/enrichment";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { rankPlanningResultsByApplicantOrCompany } from "@/lib/planning-result-ranking";

export const runtime = "nodejs";

/** Vercel Pro: PlanWire is fast, but we keep the same ceiling for enrichment. */
export const maxDuration = 120;

const MAX_LIMIT = 100;

export async function GET(req: Request) {
  const gate = await requireSubscribedTenant();
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const rl = await checkRateLimit("search", gate.ctx.user.id);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const { searchParams } = new URL(req.url);
  const west = Number(searchParams.get("west"));
  const south = Number(searchParams.get("south"));
  const east = Number(searchParams.get("east"));
  const north = Number(searchParams.get("north"));

  if (
    [west, south, east, north].some((n) => Number.isNaN(n)) ||
    west >= east ||
    south >= north
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid bounds: provide west, south, east, north (WGS84) with west < east and south < north.",
      },
      { status: 400 },
    );
  }

  const tooLarge = bboxTooLargeError(west, south, east, north);
  if (tooLarge) {
    return NextResponse.json({ error: tooLarge }, { status: 400 });
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit")) || 50),
  );
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const developmentTypes = searchParams.getAll("development_type");
  const applicationTypes = searchParams.getAll("application_type");
  const statuses = searchParams.getAll("status");
  const decisionDateFrom = searchParams.get("decision_date_from") ?? undefined;
  const decisionDateTo = searchParams.get("decision_date_to") ?? undefined;
  const indexedSinceYearRaw =
    searchParams.get("entry_date_year") ??
    searchParams.get("indexed_since_year");
  const indexedSinceYear =
    indexedSinceYearRaw != null &&
    indexedSinceYearRaw.trim() !== "" &&
    !Number.isNaN(Number(indexedSinceYearRaw))
      ? Math.floor(Number(indexedSinceYearRaw))
      : undefined;

  try {
    const apps = await fetchPlanwireApplicationsByBbox({
      west,
      south,
      east,
      north,
      limit: limit + offset,
      filters: {
        developmentTypes: developmentTypes.length ? developmentTypes : undefined,
        applicationTypes: applicationTypes.length ? applicationTypes : undefined,
        statuses: statuses.length ? statuses : undefined,
        decisionDateFrom,
        decisionDateTo,
        indexedSinceYear,
      },
    });

    // PlanWire returns a flat list — paginate client-side so the existing
    // prev/next UI keeps working identically to the Planning Data era.
    const paged = apps.slice(offset, offset + limit);
    const entities = paged.map(mapPlanwireToPlanningEntity);

    // Opportunistic enrichment with a hard deadline; failures are silent.
    const enriched = await enrichSearchResults(entities, { budgetMs: 2000 });
    const ranked = rankPlanningResultsByApplicantOrCompany(enriched);

    return NextResponse.json({
      entities: ranked,
      count: apps.length,
      rawCount: apps.length,
    });
  } catch (e) {
    if (e instanceof PlanwireRateLimitedError) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429 },
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
