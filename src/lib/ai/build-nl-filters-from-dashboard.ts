import { filterSchema, type NlFilterResult } from "@/lib/ai/nl-search-parse";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function normaliseDate(s: string): string | null {
  return s.trim() === "" || !dateRe.test(s) ? null : s;
}

function buildSummary(
  state: {
    statuses: string[];
    applicationTypes: string[];
    developmentTypes: string[];
  },
): string {
  const parts: string[] = [];
  if (state.statuses.length) {
    parts.push(`status: ${state.statuses.join(", ")}`);
  }
  if (state.applicationTypes.length) {
    parts.push(`type: ${state.applicationTypes.join(", ")}`);
  }
  if (state.developmentTypes.length) {
    parts.push(`development: ${state.developmentTypes.join(", ")}`);
  }
  const base =
    parts.length > 0
      ? `Manual filters — ${parts.join(" · ")}`
      : "Manual map filters (current selection)";
  return base.length > 160 ? base.slice(0, 157) + "…" : base;
}

/**
 * Map Explore sidebar filter state to the shared `NlFilterResult` (same shape as
 * `parseNlSearch` / `POST /api/ai/deep-search` with `filters`).
 */
export function buildNlFiltersFromDashboardState(args: {
  statuses: string[];
  applicationTypes: string[];
  developmentTypes: string[];
  decisionFrom: string;
  decisionTo: string;
  indexedSinceYear: string;
  locationHint: string | null;
  applicantLike: string | null;
  keywords: string[];
}): { ok: true; filters: NlFilterResult } | { ok: false; error: string } {
  const decisionFrom = normaliseDate(args.decisionFrom);
  const decisionTo = normaliseDate(args.decisionTo);
  const rawYear = args.indexedSinceYear.trim();
  let indexedSinceYear: number | null = null;
  if (rawYear !== "" && !Number.isNaN(Number(rawYear))) {
    const n = Math.floor(Number(rawYear));
    if (n >= 2000 && n <= 2100) indexedSinceYear = n;
  }
  const summary = buildSummary({
    statuses: args.statuses,
    applicationTypes: args.applicationTypes,
    developmentTypes: args.developmentTypes,
  });
  const candidate: unknown = {
    statuses: args.statuses,
    applicationTypes: args.applicationTypes,
    developmentTypes: args.developmentTypes,
    decisionFrom,
    decisionTo,
    indexedSinceYear,
    locationHint: args.locationHint?.trim() || null,
    applicantLike: args.applicantLike?.trim() || null,
    keywords: args.keywords,
    summary,
  };
  const parsed = filterSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid filters" };
  }
  return { ok: true, filters: parsed.data };
}
