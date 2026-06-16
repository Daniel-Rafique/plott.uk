/**
 * Shared types and geometry helpers used by the planning-application surfaces.
 *
 * NOTE: PlanWire is the single source of truth for planning data. The HTTP
 * helpers that previously hit `planning.data.gov.uk` have been removed. Only
 * the shared entity shape, bbox math, and WKT utilities live here now — the
 * module name is kept for backward compatibility with existing imports.
 */

/**
 * Max map area (square degrees). Kept as a client+server guard on very large
 * viewports (e.g. whole-country queries) so we don't ask PlanWire for a bbox
 * that is effectively unbounded.
 */
export const MAX_BBOX_AREA_SQ_DEG = 0.0009;

export function bboxAreaSqDeg(
  west: number,
  south: number,
  east: number,
  north: number,
): number {
  return (east - west) * (north - south);
}

/** Shared client+server check — keeps the map button and the API in sync. */
export function isBboxSearchable(
  west: number,
  south: number,
  east: number,
  north: number,
): boolean {
  return bboxAreaSqDeg(west, south, east, north) <= MAX_BBOX_AREA_SQ_DEG;
}

/** Approximate bbox area in km² at mid-latitude (for humane UI copy). */
export function bboxAreaKm2(
  west: number,
  south: number,
  east: number,
  north: number,
): number {
  const midLatRad = (((south + north) / 2) * Math.PI) / 180;
  const kmPerDeg = 111.32;
  const lonSpanKm = (east - west) * kmPerDeg * Math.cos(midLatRad);
  const latSpanKm = (north - south) * kmPerDeg;
  return Math.max(0, lonSpanKm * latSpanKm);
}

export function bboxTooLargeError(
  west: number,
  south: number,
  east: number,
  north: number,
): string | null {
  if (isBboxSearchable(west, south, east, north)) return null;
  return (
    "This area is too large for a fast search — zoom in a little and try again."
  );
}

export type Bbox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

/**
 * Shrinks an oversized bbox to a centered square of max searchable area.
 * Saved-search cron calls PlanWire with a 5 km radius cap on large boxes, but
 * `/api/planning/search` rejects anything over MAX_BBOX_AREA_SQ_DEG — reopening
 * a saved search from the dashboard must use the same limit or users see a
 * false "area too large" while digests still find leads.
 */
export function clampBboxToSearchable(bounds: Bbox): Bbox {
  const { west, south, east, north } = bounds;
  if (isBboxSearchable(west, south, east, north)) {
    return { west, south, east, north };
  }
  const side = Math.sqrt(MAX_BBOX_AREA_SQ_DEG * 0.999);
  const half = side / 2;
  const cx = (west + east) / 2;
  const cy = (south + north) / 2;
  return {
    west: cx - half,
    east: cx + half,
    south: cy - half,
    north: cy + half,
  };
}

export type PlanningApplicationEntity = {
  entity: number;
  reference?: string;
  "address-text"?: string;
  point?: string;
  description?: string;
  "decision-date"?: string;
  "planning-decision-type"?: string;
  "planning-application-status"?: string;
  "planning-application-type"?: string;
  "development-type"?: string;
  "organisation-entity"?: string | number;
  "start-date"?: string;
  "entry-date"?: string;
  /**
   * Outbound link to the authoritative source for this application — PlanWire
   * returns the council-portal URL per row. Empty when the upstream has no URL.
   */
  sourceUrl?: string;
  /** PlanWire council slug (e.g. `cam`, `adu`) — used for council-portal lookups. */
  councilId?: string;
  /** Separate postcode when the upstream provides it outside the address string. */
  postcode?: string;
  /** Optional enrichment added by `enrichSearchResults` or the PlanWire mapper. */
  enrichment?: {
    applicantName?: string | null;
    applicantEmail?: string | null;
    companyName?: string | null;
    agentName?: string | null;
    agentAddress?: string | null;
    agentEmail?: string | null;
    source?: string;
    confidence?: "low" | "medium" | "high";
  };
};

export type PlanningSearchResponse = {
  entities: PlanningApplicationEntity[];
  count?: number;
  links?: Record<string, string>;
  /** Upstream row count before client-side filters ran. */
  rawCount?: number;
};

export type PlanningSearchFilters = {
  developmentTypes?: string[];
  applicationTypes?: string[];
  statuses?: string[];
  decisionDateFrom?: string;
  decisionDateTo?: string;
  indexedSinceYear?: number;
};

export function bboxToPolygonWkt(
  west: number,
  south: number,
  east: number,
  north: number,
) {
  return `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`;
}

export function parseWktPoint(
  wkt: string | undefined,
): { lng: number; lat: number } | null {
  if (!wkt) return null;
  const m = wkt.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  return { lng: Number.parseFloat(m[1]), lat: Number.parseFloat(m[2]) };
}
