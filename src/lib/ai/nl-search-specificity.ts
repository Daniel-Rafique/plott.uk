/**
 * Helpers for under-specified NL planning searches (place / status only)
 * and for deriving a PlanWire full-text `q` when the parser set enums but
 * left `keywords` empty.
 */

import type { NlFilterResult } from "@/lib/ai/nl-search-parse";

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  granted: "Approved",
  refused: "Refused",
  withdrawn: "Withdrawn",
  pending: "Pending",
};

/** True when the parse has no thematic signal (work type, keywords, applicant). */
export function isUnderSpecifiedNlSearch(
  filters: Pick<
    NlFilterResult,
    | "keywords"
    | "developmentTypes"
    | "applicationTypes"
    | "applicantLike"
    | "locationHint"
    | "statuses"
    | "decisionFrom"
    | "decisionTo"
    | "indexedSinceYear"
  >,
  opts?: { hasMapBounds?: boolean },
): boolean {
  const hasThematic =
    filters.keywords.length > 0 ||
    filters.developmentTypes.length > 0 ||
    filters.applicationTypes.length > 0 ||
    Boolean(filters.applicantLike?.trim());
  if (hasThematic) return false;

  const hasPlace =
    Boolean(filters.locationHint?.trim()) || Boolean(opts?.hasMapBounds);
  if (!hasPlace) return false;

  // Place-only or place + status/dates — both benefit from work-type coaching.
  return true;
}

/**
 * Build clickable follow-up prompts that keep the user's place/status wording
 * and add a concrete work type.
 */
export function buildVagueSearchSuggestions(
  filters: Pick<NlFilterResult, "locationHint" | "statuses">,
): string[] {
  const place = filters.locationHint?.trim() || "this area";
  const statusKey = filters.statuses[0];
  const statusWord = statusKey
    ? (STATUS_LABEL[statusKey] ?? capitalize(statusKey))
    : null;

  const prefix = statusWord ? `${statusWord} ` : "";
  return [
    `${prefix}residential extensions in ${place}`,
    `${prefix}householder applications in ${place}`,
    `${statusWord ? statusWord : "Recent"} loft conversions in ${place}`,
  ];
}

export const VAGUE_SEARCH_HINT_MESSAGE =
  "Add a work type for sharper results — status and place alone return a broad sample.";

/**
 * Prefer explicit keywords; otherwise derive a PlanWire `q` from development /
 * application type enums so enum-only parses still get full-text help.
 */
export function derivePlanwireQuery(
  filters: Pick<
    NlFilterResult,
    "keywords" | "developmentTypes" | "applicationTypes"
  >,
): string | undefined {
  if (filters.keywords.length > 0) {
    return filters.keywords.join(" ");
  }

  const parts: string[] = [];
  for (const t of filters.developmentTypes) {
    const q = DEVELOPMENT_TYPE_QUERY[t];
    if (q) parts.push(q);
  }
  for (const t of filters.applicationTypes) {
    const q = APPLICATION_TYPE_QUERY[t];
    if (q) parts.push(q);
  }

  const unique = [...new Set(parts.map((p) => p.trim()).filter(Boolean))];
  return unique.length ? unique.join(" ") : undefined;
}

const DEVELOPMENT_TYPE_QUERY: Record<string, string> = {
  residential: "residential",
  commercial: "commercial",
  "change of use": "change of use",
  extension: "extension",
  "new build": "new build",
  "mixed use": "mixed use",
};

const APPLICATION_TYPE_QUERY: Record<string, string> = {
  full: "full",
  outline: "outline",
  "reserved matters": "reserved matters",
  householder: "householder",
  "listed building": "listed building",
  "prior approval": "prior approval",
};

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
