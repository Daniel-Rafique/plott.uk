import type {
  PlanningApplicationEntity,
  PlanningSearchFilters,
} from "@/lib/planning-data";
import { logger } from "@/lib/logger";
import { geocodePostcodes } from "@/lib/geocode";
import { decodeHtmlEntities } from "@/lib/utils";

/**
 * Typed error for PlanWire 429 / circuit-breaker cooldowns. API routes catch
 * this and return HTTP 429 so the client can surface a single, consistent toast
 * rather than translating opaque "empty results" into a misleading "no data".
 */
export class PlanwireRateLimitedError extends Error {
  readonly retryAfterMs: number | null;
  readonly context: string;
  constructor(context: string, retryAfterMs: number | null) {
    super(`planwire_rate_limited:${context}`);
    this.name = "PlanwireRateLimitedError";
    this.context = context;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Approximate bbox diagonal in km using Haversine. Inlined here rather than
 * imported from planning-data to avoid a circular module reference that
 * leaves `bboxAreaKm2` undefined under Turbopack's ESM chunking.
 */
function approxBboxRadiusKm(
  west: number,
  south: number,
  east: number,
  north: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(north - south);
  const dLng = toRad(east - west);
  const meanLat = toRad((north + south) / 2);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(meanLat) ** 2 * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a))) / 2;
}

/**
 * Process-level rate-limit circuit breaker. When PlanWire returns 429 we record
 * a cooldown timestamp; any call made before it expires short-circuits to
 * `null` so we stop hammering their API (and stop spamming the console). One
 * structured warning is emitted per cooldown window.
 *
 * We honour `Retry-After` when present (seconds or HTTP-date), else back off
 * 30s — long enough for their token bucket to refill without blocking the user
 * for visibly long periods.
 */
const RATE_LIMIT_FALLBACK_MS = 30_000;
const planwireState = {
  cooldownUntil: 0,
  lastWarnAt: 0,
};

/**
 * PlanWire's starter tier caps `applications/nearby` at a 5 km radius. Bboxes
 * that exceed this return HTTP 400. We cap client-side to keep the common
 * "whole borough" query (e.g. Lambeth, ~47 km², ~5.9 km half-diagonal) from
 * tripping the limit. If the tier ever changes, the retry helper below can
 * parse the actual cap out of the error body and adapt on the fly.
 */
const PLANWIRE_NEARBY_MAX_RADIUS_KM = 5;

/**
 * Extract the "up to Nkm" value from PlanWire's tier-limit error body so we
 * can retry with a compliant radius. Returns `null` when the body doesn't
 * match the known phrasing (e.g. a genuine 400 we shouldn't retry).
 */
function parsePlanwireRadiusLimit(body: string): number | null {
  const match = body.match(/up to\s+(\d+(?:\.\d+)?)\s*km/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function planwireInCooldown(): boolean {
  return Date.now() < planwireState.cooldownUntil;
}

/**
 * Public read-only view of the PlanWire rate-limit state so other modules
 * (agent tools, deterministic fallback) can decide to skip PlanWire when we
 * already know the call will short-circuit.
 */
export function isPlanwireInCooldown(): {
  cooldown: boolean;
  cooldownUntil: number;
} {
  return {
    cooldown: planwireInCooldown(),
    cooldownUntil: planwireState.cooldownUntil,
  };
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const ts = Date.parse(header);
  if (Number.isFinite(ts)) return Math.max(0, ts - Date.now());
  return null;
}

function tripPlanwireCooldown(res: Response, context: string): void {
  const retryAfterMs =
    parseRetryAfter(res.headers.get("retry-after")) ?? RATE_LIMIT_FALLBACK_MS;
  const until = Date.now() + retryAfterMs;
  planwireState.cooldownUntil = Math.max(planwireState.cooldownUntil, until);
  if (Date.now() - planwireState.lastWarnAt > 5_000) {
    planwireState.lastWarnAt = Date.now();
    logger.warn(
      {
        context,
        retryAfterMs,
        cooldownUntil: new Date(until).toISOString(),
      },
      "planwire_rate_limited",
    );
  }
}

export type PlanwireApplication = {
  id: string;
  councilId: string;
  reference: string;
  address: string;
  postcode: string;
  lat: number;
  lng: number;
  description: string;
  status: string;
  decision: string;
  decisionDate: string;
  url: string;
  applicationType?: string;
  developmentType?: string;
  category?: string;
  applicant?: {
    name?: string;
    agent?: string;
    company?: string;
    agentAddress?: string;
  };
  source?: "planwire";
  /** True when PlanWire returns the case but no applicant/agent fields (their public schema often omits PII). */
  applicantNamesNotInFeed?: boolean;
  /** LPA website when returned by GET /v1/councils/:id — useful when `url` is empty. */
  councilWebsite?: string;
};

export type PlanwireCouncil = {
  id: string;
  name: string;
};

type PlanwireListResponse<T> = {
  data?: T[];
  meta?: { total: number; page: number; limit: number; pages: number };
};

const COUNCILS_TTL_MS = 24 * 60 * 60 * 1000;
let councilsMemo: { fetchedAt: number; councils: PlanwireCouncil[] } | null =
  null;

/**
 * Per-process cache of council website lookups. Council info is effectively
 * static, and previously we re-fetched it for every row in a search result,
 * multiplying PlanWire load by the page size.
 */
const COUNCIL_WEBSITE_TTL_MS = 24 * 60 * 60 * 1000;
const councilWebsiteCache = new Map<
  string,
  { fetchedAt: number; website: string | undefined }
>();

function pickStr(v: unknown): string | undefined {
  if (typeof v !== "string" || v.trim() === "") return undefined;
  // PlanWire (and some LPA feeds) return HTML-encoded plain text, e.g. "Mr &amp; Mrs".
  return decodeHtmlEntities(v) ?? undefined;
}

function normaliseForMatch(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function textHasAny(haystack: string, needles: string[]): boolean {
  if (!haystack) return false;
  return needles.some((needle) => haystack.includes(needle));
}

function matchSelectedTextGroup(
  selected: string[] | undefined,
  text: string,
  classifiers: Record<string, string[]>,
): boolean {
  if (!selected?.length) return true;
  return selected.some((raw) => {
    const value = normaliseForMatch(raw);
    const needles = classifiers[value] ?? [value];
    return textHasAny(text, needles);
  });
}

function matchesStatus(
  app: PlanwireApplication,
  statuses: string[] | undefined,
): boolean {
  if (!statuses?.length) return true;
  const text = normaliseForMatch(`${app.status} ${app.decision}`);
  return matchSelectedTextGroup(statuses, text, {
    approved: [
      "approved",
      "approve",
      "approval",
      "granted",
      "grant",
      "final decision",
      "permitted",
    ],
    granted: [
      "granted",
      "grant",
      "approved",
      "approve",
      "approval",
      "final decision",
      "permitted",
    ],
    refused: ["refused", "refuse", "rejected", "reject", "declined"],
    withdrawn: ["withdrawn", "withdraw", "cancelled", "canceled"],
    pending: [
      "pending",
      "awaiting",
      "registered",
      "received",
      "under consideration",
      "undecided",
    ],
  });
}

function matchesDecisionDate(
  app: PlanwireApplication,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (!from && !to) return true;
  const date = app.decisionDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function matchesIndexedSinceYear(
  app: PlanwireApplication,
  year: number | undefined,
): boolean {
  if (year == null) return true;
  // decisionDate is backfilled from receivedDate in mapToPlanwireApplication
  // when the council has not issued a decision yet.
  const date = app.decisionDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date >= `${year}-01-01`;
}


function applicationMatchText(app: PlanwireApplication): string {
  return normaliseForMatch(
    [
      app.applicationType,
      app.category,
      app.reference,
      app.description,
    ].join(" "),
  );
}

function developmentMatchText(app: PlanwireApplication): string {
  return normaliseForMatch(
    [
      app.developmentType,
      app.category,
      app.reference,
      app.description,
    ].join(" "),
  );
}

function matchesApplicationType(
  app: PlanwireApplication,
  applicationTypes: string[] | undefined,
): boolean {
  const text = applicationMatchText(app);
  return matchSelectedTextGroup(applicationTypes, text, {
    full: ["full", "ful", "full planning"],
    outline: ["outline", "out"],
    "reserved matters": ["reserved matters", "reserved matter", "rem"],
    householder: ["householder", "hse", "hh", "homeowner"],
    "listed building": ["listed building", "listed", "lbc"],
    "prior approval": ["prior approval", "prior notification", "permitted development"],
  });
}

function matchesDevelopmentType(
  app: PlanwireApplication,
  developmentTypes: string[] | undefined,
): boolean {
  const text = developmentMatchText(app);
  return matchSelectedTextGroup(developmentTypes, text, {
    residential: [
      "residential",
      "dwelling",
      "dwellinghouse",
      "house",
      "flat",
      "apartments",
      "homes",
    ],
    commercial: [
      "commercial",
      "office",
      "shop",
      "retail",
      "restaurant",
      "cafe",
      "industrial",
      "warehouse",
    ],
    "change of use": ["change of use", "change use", "change-of-use"],
    extension: ["extension", "extend", "enlargement", "loft", "dormer"],
    "new build": [
      "new build",
      "new-build",
      "erection",
      "construction",
      "construct",
      "new dwelling",
      "new house",
    ],
    "mixed use": ["mixed use", "mixed-use"],
  });
}

export function filterPlanwireApplications(
  apps: PlanwireApplication[],
  filters: PlanningSearchFilters | undefined,
): PlanwireApplication[] {
  if (!filters) return apps;
  return apps.filter(
    (app) =>
      matchesStatus(app, filters.statuses) &&
      matchesDecisionDate(app, filters.decisionDateFrom, filters.decisionDateTo) &&
      matchesIndexedSinceYear(app, filters.indexedSinceYear) &&
      matchesApplicationType(app, filters.applicationTypes) &&
      matchesDevelopmentType(app, filters.developmentTypes),
  );
}

function normalizeLpaName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(the|of|and|&|'s)\b/g, " ")
    .replace(/\b(london borough of)\b/g, " ")
    .replace(
      /\b(unitary authority|metropolitan|district|city|borough|county)\b/g,
      " ",
    )
    .replace(/\bcouncil\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenScore(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  const ta = new Set(a.split(" ").filter((t) => t.length > 1));
  const tb = new Set(b.split(" ").filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size, 1);
}

/**
 * Map PlanWire council list + Planning Data LPA label → PlanWire `council` slug.
 */
export function matchPlanwireCouncilId(
  planningOrganisationName: string,
  councils: PlanwireCouncil[],
): string | null {
  const trimmed = planningOrganisationName.trim();
  if (!trimmed) return null;
  const p = normalizeLpaName(trimmed);

  let best: { id: string; score: number } | null = null;
  for (const c of councils) {
    const n = normalizeLpaName(c.name);
    if (p === n) return c.id;
    const score = tokenScore(p, n);
    if (!best || score > best.score) best = { id: c.id, score };
  }

  if (best && best.score >= 0.45) return best.id;
  return null;
}

async function loadPlanwireCouncils(apiKey: string): Promise<PlanwireCouncil[]> {
  const all: PlanwireCouncil[] = [];
  let page = 1;
  for (;;) {
    if (planwireInCooldown()) return all;
    const url = new URL("https://api.planwire.io/v1/councils");
    url.searchParams.set("limit", "100");
    url.searchParams.set("page", String(page));
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      next: { revalidate: 86400 },
    });
    if (res.status === 429) {
      tripPlanwireCooldown(res, "councils");
      return all;
    }
    if (!res.ok) {
      logger.warn({ status: res.status }, "planwire_councils_list_failed");
      return all;
    }
    const json = (await res.json()) as PlanwireListResponse<PlanwireCouncil>;
    if (!Array.isArray(json.data) || json.data.length === 0) break;
    all.push(...json.data);
    if (json.meta && page >= json.meta.pages) break;
    if (json.data.length < 100) break;
    page += 1;
  }
  return all;
}

export async function getPlanwireCouncils(): Promise<PlanwireCouncil[]> {
  const apiKey = process.env.PLANWIRE_API_KEY;
  if (!apiKey) return [];
  if (
    councilsMemo &&
    Date.now() - councilsMemo.fetchedAt < COUNCILS_TTL_MS
  ) {
    return councilsMemo.councils;
  }
  const councils = await loadPlanwireCouncils(apiKey);
  councilsMemo = { fetchedAt: Date.now(), councils };
  return councils;
}

function formatAddressLike(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const t = value.trim();
    return t ? t : undefined;
  }
  if (typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  const lines = [
    pickStr(o.line1 ?? o.addressLine1 ?? o.address_line_1),
    pickStr(o.line2 ?? o.addressLine2 ?? o.address_line_2),
    pickStr(o.line3 ?? o.addressLine3 ?? o.address_line_3),
    pickStr(o.street),
    pickStr(o.locality ?? o.district),
    pickStr(o.town ?? o.city),
    pickStr(o.county ?? o.region),
    pickStr(o.postcode ?? o.postal_code ?? o.postCode),
    pickStr(o.country),
  ].filter(Boolean) as string[];
  if (lines.length === 0) {
    const fallback = pickStr(o.formatted ?? o.full ?? o.address);
    return fallback;
  }
  return lines.join(", ");
}

function mapApplicant(raw: unknown): PlanwireApplication["applicant"] {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const name = pickStr(
    o.name ?? o.applicant_name ?? o.applicantName ?? o.fullName,
  );
  const agent = pickStr(o.agent ?? o.agent_name ?? o.agentName);
  const company = pickStr(o.company ?? o.company_name ?? o.companyName);
  const agentObj =
    o.agent && typeof o.agent === "object"
      ? (o.agent as Record<string, unknown>)
      : undefined;
  const agentAddress = formatAddressLike(
    o.agentAddress ??
      o.agent_address ??
      agentObj?.address ??
      o.agentContactAddress,
  );
  if (!name && !agent && !company && !agentAddress) return undefined;
  return { name, agent, company, agentAddress };
}

function mergeApplicantParts(
  a: PlanwireApplication["applicant"] | undefined,
  b: PlanwireApplication["applicant"] | undefined,
): PlanwireApplication["applicant"] | undefined {
  if (!a && !b) return undefined;
  return {
    name: a?.name ?? b?.name,
    agent: a?.agent ?? b?.agent,
    company: a?.company ?? b?.company,
    agentAddress: a?.agentAddress ?? b?.agentAddress,
  };
}

/** Flat / alternate keys some feeds use instead of nested `applicant`. */
function extractApplicantFromRowHeuristics(
  row: Record<string, unknown>,
): PlanwireApplication["applicant"] | undefined {
  const name = pickStr(
    row.applicantName ??
      row.applicant_name ??
      row.applicantFullName ??
      row.applicant_full_name ??
      row.proposer ??
      row.proposed_by ??
      row.ownerName ??
      row.owner_name,
  );
  const agent = pickStr(
    row.agentName ??
      row.agent_name ??
      row.planning_agent ??
      row.agentContact,
  );
  const company = pickStr(
    row.companyName ?? row.company_name ?? row.applicantCompany ?? row.applicant_company,
  );
  const agentAddress = formatAddressLike(
    row.agentAddress ??
      row.agent_address ??
      row.agentContactAddress ??
      row.agent_contact_address,
  );

  const parties = row.parties;
  if (Array.isArray(parties)) {
    let partyAgent: string | undefined = agent;
    let partyAgentAddress: string | undefined = agentAddress;
    let partyApplicant: string | undefined;
    for (const item of parties) {
      if (!item || typeof item !== "object") continue;
      const p = item as Record<string, unknown>;
      const role = String(p.role ?? p.type ?? p.partyType ?? "").toLowerCase();
      const pn = pickStr(p.name ?? p.fullName);
      const pAddr = formatAddressLike(p.address ?? p.contactAddress);
      if (role.includes("agent")) {
        if (pn && !partyAgent) partyAgent = pn;
        if (pAddr && !partyAgentAddress) partyAgentAddress = pAddr;
      } else if (
        role.includes("applicant") ||
        role === "owner" ||
        role === "submitter"
      ) {
        if (pn && !partyApplicant) partyApplicant = pn;
      }
    }
    if (partyApplicant || partyAgent || partyAgentAddress) {
      return mergeApplicantParts(
        { name: partyApplicant, agent: partyAgent, company, agentAddress: partyAgentAddress },
        { name, agent, company, agentAddress },
      );
    }
  }

  if (!name && !agent && !company && !agentAddress) return undefined;
  return { name, agent, company, agentAddress };
}

function extractDataObjectFromPayload(
  json: unknown,
): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (o.data && typeof o.data === "object" && !Array.isArray(o.data)) {
    return o.data as Record<string, unknown>;
  }
  return o;
}

/** Shallow merge: prefer secondary values for likely applicant-related keys. */
function mergeRawApplicationRows(
  primary: Record<string, unknown>,
  secondary: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...primary };
  for (const [k, v] of Object.entries(secondary)) {
    if (v == null || v === "") continue;
    if (
      /applicant|agent|party|proposer|owner|company|contact/i.test(k) ||
      k === "parties"
    ) {
      if (out[k] == null || out[k] === "") out[k] = v;
    }
  }
  return out;
}

export function applicantObjectHasAnyNames(
  a: PlanwireApplication["applicant"] | undefined,
): boolean {
  if (!a) return false;
  return Boolean(
    (a.name && a.name.trim()) ||
      (a.agent && a.agent.trim()) ||
      (a.company && a.company.trim()),
  );
}

export async function fetchPlanwireCouncilWebsite(
  councilId: string,
): Promise<string | undefined> {
  const apiKey = process.env.PLANWIRE_API_KEY;
  if (!apiKey) return undefined;

  const cached = councilWebsiteCache.get(councilId);
  if (cached && Date.now() - cached.fetchedAt < COUNCIL_WEBSITE_TTL_MS) {
    return cached.website;
  }
  if (planwireInCooldown()) return cached?.website;

  try {
    const res = await fetch(
      `https://api.planwire.io/v1/councils/${encodeURIComponent(councilId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        next: { revalidate: 86400 },
      },
    );
    if (res.status === 429) {
      tripPlanwireCooldown(res, "councils/:id");
      return cached?.website;
    }
    if (!res.ok) return cached?.website;
    const json = (await res.json()) as unknown;
    const row = extractDataObjectFromPayload(json);
    const website = row
      ? pickStr(
          row.website ??
            row.portalUrl ??
            row.portal_url ??
            row.url ??
            row.homepage,
        )
      : undefined;
    councilWebsiteCache.set(councilId, { fetchedAt: Date.now(), website });
    return website;
  } catch {
    return cached?.website;
  }
}

function mapToPlanwireApplication(
  row: Record<string, unknown>,
): PlanwireApplication | null {
  const id = pickStr(row.id ?? row.uuid ?? row._id);
  const councilId = pickStr(row.councilId ?? row.council_id);
  const reference = pickStr(row.reference ?? row.ref);
  if (!id || !councilId || !reference) return null;

  const fromNested = mapApplicant(row.applicant ?? row.applicant_details);
  const fromHeuristics = extractApplicantFromRowHeuristics(row);
  const applicant = mergeApplicantParts(fromNested, fromHeuristics);

  return {
    id,
    councilId,
    reference,
    address: pickStr(row.address) ?? "",
    postcode: pickStr(row.postcode) ?? "",
    lat: Number(row.lat ?? row.latitude ?? 0),
    lng: Number(row.lng ?? row.longitude ?? row.lon ?? 0),
    description: pickStr(row.description) ?? "",
    status: pickStr(row.status) ?? "",
    decision: pickStr(row.decision) ?? "",
    decisionDate:
      pickStr(
        row.decisionDate ??
          row.decision_date ??
          row.received_date ??
          row.receivedDate,
      ) ?? "",
    url: pickStr(row.url ?? row.portalUrl ?? row.portal_url) ?? "",
    applicationType: pickStr(
      row.applicationType ??
        row.application_type ??
        row.planningApplicationType ??
        row.planning_application_type ??
        row.type,
    ),
    developmentType: pickStr(
      row.developmentType ??
        row.development_type ??
        row.developmentCategory ??
        row.development_category,
    ),
    category: pickStr(row.category ?? row.applicationCategory ?? row.application_category),
    applicant,
  };
}

async function fetchRawApplicationById(
  id: string,
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.PLANWIRE_API_KEY;
  if (!apiKey) return null;
  if (!id.trim()) return null;
  if (planwireInCooldown()) return null;
  try {
    const res = await fetch(
      `https://api.planwire.io/v1/applications/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        next: { revalidate: 3600 },
      },
    );
    if (res.status === 429) {
      tripPlanwireCooldown(res, "applications/:id");
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return extractDataObjectFromPayload(json);
  } catch {
    return null;
  }
}

/** Merge GET-by-ref with GET-by-uuid and attach council website + missing-name flag. */
async function enrichApplicationRecord(
  row: Record<string, unknown>,
): Promise<PlanwireApplication | null> {
  let merged = { ...row };
  const rowId = pickStr(merged.id ?? merged.uuid ?? merged._id);
  if (rowId) {
    const byId = await fetchRawApplicationById(rowId);
    if (byId) merged = mergeRawApplicationRows(merged, byId);
  }

  const app = mapToPlanwireApplication(merged);
  if (!app) return null;

  const councilWebsite = await fetchPlanwireCouncilWebsite(app.councilId);
  const withCouncil: PlanwireApplication = councilWebsite
    ? { ...app, councilWebsite }
    : app;

  if (!applicantObjectHasAnyNames(withCouncil.applicant)) {
    return { ...withCouncil, applicantNamesNotInFeed: true };
  }
  return withCouncil;
}

/**
 * Canonical lookup: council slug + authority reference (PlanWire docs).
 * @see https://planwire.io/docs — GET /v1/applications/ref/:council/:reference
 */
export async function fetchPlanwireApplicationByCouncilRef(
  councilId: string,
  reference: string,
): Promise<PlanwireApplication | null> {
  const apiKey = process.env.PLANWIRE_API_KEY;
  if (!apiKey) {
    console.warn("PLANWIRE_API_KEY not set. PlanWire integration is disabled.");
    return null;
  }
  if (planwireInCooldown()) return null;

  const path = `${encodeURIComponent(councilId)}/${encodeURIComponent(reference)}`;
  const url = `https://api.planwire.io/v1/applications/ref/${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (res.status === 404) return null;
    if (res.status === 429) {
      tripPlanwireCooldown(res, "applications/ref");
      return null;
    }
    if (!res.ok) {
      logger.warn(
        { status: res.status, councilId, reference },
        "planwire_ref_lookup_non_ok",
      );
      return null;
    }

    const json = (await res.json()) as unknown;
    const row = extractDataObjectFromPayload(json);
    if (!row) return null;
    return enrichApplicationRecord(row);
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "planwire_ref_lookup_error",
    );
    return null;
  }
}

export type PlanwireSearchQuery = {
  q?: string;
  council?: string;
  postcode?: string;
  status?: "Pending" | "Approved" | "Refused" | "Withdrawn";
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
};

/**
 * Keyword / council / postcode / status search over GET /v1/applications.
 * Mirrors PlanWire's `search_planning_applications` MCP tool so the in-app
 * agent can answer area and keyword queries without a map bbox.
 *
 * Returns lightweight rows only — no per-row enrichApplicationRecord fan-out.
 */
export async function fetchPlanwireApplicationsByQuery(
  query: PlanwireSearchQuery,
): Promise<PlanwireApplication[]> {
  const apiKey = process.env.PLANWIRE_API_KEY;
  if (!apiKey) {
    console.warn("PLANWIRE_API_KEY not set. PlanWire integration is disabled.");
    return [];
  }
  if (planwireInCooldown()) return [];

  const url = new URL("https://api.planwire.io/v1/applications");
  if (query.q) url.searchParams.set("q", query.q);
  if (query.council) url.searchParams.set("council", query.council);
  if (query.postcode) url.searchParams.set("postcode", query.postcode);
  if (query.status) url.searchParams.set("status", query.status);
  if (query.type) url.searchParams.set("type", query.type);
  if (query.dateFrom) url.searchParams.set("date_from", query.dateFrom);
  if (query.dateTo) url.searchParams.set("date_to", query.dateTo);
  url.searchParams.set("page", String(query.page ?? 1));
  url.searchParams.set("limit", String(Math.min(query.limit ?? 20, 100)));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      next: { revalidate: 300 },
    });

    if (res.status === 429) {
      tripPlanwireCooldown(res, "applications?search");
      const retryAfterMs = Math.max(0, planwireState.cooldownUntil - Date.now());
      throw new PlanwireRateLimitedError("applications?search", retryAfterMs);
    }
    if (!res.ok) {
      logger.warn({ status: res.status }, "planwire_query_search_non_ok");
      return [];
    }

    const json = (await res.json()) as PlanwireListResponse<
      Record<string, unknown>
    >;
    const apps = (json.data ?? [])
      .map(mapToPlanwireApplication)
      .filter((a): a is PlanwireApplication => a !== null);

    // PlanWire's list endpoint returns postcodes but not coordinates, so the
    // client can't place map pins. Geocode the postcodes (bulk, UK-only, free)
    // and backfill lat/lng so search results appear live on the map.
    await backfillCoordsFromPostcodes(apps);

    return apps;
  } catch (error) {
    if (error instanceof PlanwireRateLimitedError) throw error;
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "planwire_query_search_error",
    );
    return [];
  }
}

/** True when a PlanWire row has no usable coordinates (missing or 0/0). */
function missingCoords(app: PlanwireApplication): boolean {
  return (
    !Number.isFinite(app.lat) ||
    !Number.isFinite(app.lng) ||
    (Math.abs(app.lat) < 0.001 && Math.abs(app.lng) < 0.001)
  );
}

/**
 * Mutates `apps` in place, filling lat/lng for rows that lack coordinates by
 * geocoding their postcode. Best-effort: rows without a postcode or that fail
 * to geocode are left as-is (the client skips coordinate-less rows).
 */
async function backfillCoordsFromPostcodes(
  apps: PlanwireApplication[],
): Promise<void> {
  const needing = apps.filter((a) => missingCoords(a) && a.postcode);
  if (needing.length === 0) return;

  try {
    const coords = await geocodePostcodes(needing.map((a) => a.postcode));
    for (const app of needing) {
      const hit = coords.get(app.postcode);
      if (hit) {
        app.lat = hit.lat;
        app.lng = hit.lng;
      }
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "planwire_postcode_backfill_failed",
    );
  }
}

/** Fallback: full-text search on address + description (weak for ref matching). */
export async function fetchPlanwireApplicationByTextSearch(
  query: string,
): Promise<PlanwireApplication | null> {
  const apiKey = process.env.PLANWIRE_API_KEY;
  if (!apiKey) return null;
  if (planwireInCooldown()) return null;

  try {
    const url = new URL("https://api.planwire.io/v1/applications");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (res.status === 404) return null;
    if (res.status === 429) {
      tripPlanwireCooldown(res, "applications?q");
      return null;
    }
    if (!res.ok) {
      logger.warn(
        { status: res.status, query },
        "planwire_text_search_non_ok",
      );
      return null;
    }

    const json = (await res.json()) as PlanwireListResponse<
      Record<string, unknown>
    >;
    if (!json.data?.length) return null;
    return enrichApplicationRecord(json.data[0]);
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "planwire_text_search_error",
    );
    return null;
  }
}

/**
 * Fetch planning applications from PlanWire using geographic search.
 * This is the production-ready replacement for Planning Data's limited coverage.
 * 
 * PlanWire covers all 379 UK councils with millions of applications and uses
 * PostGIS for fast spatial queries. Unlike Planning Data (which only has Camden
 * geocoded), PlanWire has lat/lng for virtually all applications.
 * 
 * Strategy: Sample multiple points across the bbox rather than a single centroid
 * query, then deduplicate. This ensures we find applications spread across the
 * entire area rather than just those near the center.
 */
export async function fetchPlanwireApplicationsByBbox(params: {
  west: number;
  south: number;
  east: number;
  north: number;
  limit: number;
  filters?: PlanningSearchFilters;
}): Promise<PlanwireApplication[]> {
  const apiKey = process.env.PLANWIRE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "PLANWIRE_API_KEY is not configured. PlanWire is the single source of truth for planning data; set the key and retry.",
    );
  }
  if (planwireInCooldown()) {
    const retryAfterMs = Math.max(0, planwireState.cooldownUntil - Date.now());
    throw new PlanwireRateLimitedError("applications/nearby", retryAfterMs);
  }

  const { west, south, east, north, limit, filters } = params;

  // PlanWire's `/v1/applications/nearby` takes a point + radius; we approximate
  // the visible bbox with its centroid and half the diagonal as the radius.
  // Capped at the starter-tier limit (5 km) to avoid the 400 "nearby searches
  // up to 5km" error — for larger areas (e.g. whole borough) we trade some
  // coverage for actually getting results back.
  const centerLat = (south + north) / 2;
  const centerLng = (west + east) / 2;
  const rawRadiusKm = Math.max(
    1,
    approxBboxRadiusKm(west, south, east, north),
  );
  const initialRadiusKm = Math.min(PLANWIRE_NEARBY_MAX_RADIUS_KM, rawRadiusKm);

  const buildUrl = (radiusKm: number): string => {
    const url = new URL("https://api.planwire.io/v1/applications/nearby");
    url.searchParams.set("lat", String(centerLat));
    url.searchParams.set("lng", String(centerLng));
    url.searchParams.set("radius_km", String(radiusKm));
    url.searchParams.set("limit", String(Math.min(100, limit)));

    // PlanWire's nearby endpoint only accepts one status. Use it only for
    // single-status filters; multi-select status filters are applied below
    // against the returned rows so OR semantics stay intact.
    if (filters?.statuses?.length === 1) {
      const pwStatus = filters.statuses[0];
      url.searchParams.set(
        "status",
        pwStatus.charAt(0).toUpperCase() + pwStatus.slice(1),
      );
    }
    return url.toString();
  };

  const doFetch = (radiusKm: number) =>
    fetch(buildUrl(radiusKm), {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(30_000),
    });

  let res = await doFetch(initialRadiusKm);
  let attemptedRadiusKm = initialRadiusKm;

  // Tier-limit retry. If PlanWire rejects the radius (e.g. an upgraded tier
  // lowers the cap below our 5 km client-side floor, or our Haversine
  // approximation drifts above it for a near-border bbox), parse the cap out
  // of the error body and retry once with a compliant radius.
  if (res.status === 400) {
    const text = await res.text().catch(() => "");
    const advertisedCapKm = parsePlanwireRadiusLimit(text);
    if (advertisedCapKm && advertisedCapKm < attemptedRadiusKm) {
      logger.warn(
        {
          attemptedRadiusKm,
          advertisedCapKm,
          bbox: params,
        },
        "planwire_bbox_radius_retry",
      );
      attemptedRadiusKm = advertisedCapKm;
      res = await doFetch(attemptedRadiusKm);
    } else {
      // Re-raise the original 400 through the normal error path below.
      logger.warn(
        { status: 400, bbox: params, body: text.slice(0, 500) },
        "planwire_bbox_search_failed",
      );
      throw new Error(`PlanWire error 400: ${text.slice(0, 200)}`);
    }
  }

  if (res.status === 429) {
    tripPlanwireCooldown(res, "applications/nearby");
    const retryAfterMs = Math.max(0, planwireState.cooldownUntil - Date.now());
    throw new PlanwireRateLimitedError("applications/nearby", retryAfterMs);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn(
      {
        status: res.status,
        bbox: params,
        attemptedRadiusKm,
        body: text.slice(0, 500),
      },
      "planwire_bbox_search_failed",
    );
    throw new Error(`PlanWire error ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as PlanwireListResponse<
    Record<string, unknown>
  >;
  if (!json.data?.length) return [];

  const apps: PlanwireApplication[] = [];
  for (const row of json.data) {
    const app = mapToPlanwireApplication(row);
    if (app) apps.push(app);
  }
  return filterPlanwireApplications(apps, filters);
}

export type FetchPlanwireApplicationParams = {
  reference: string;
  /** PlanWire council slug when already known (e.g. `adu`). */
  councilId?: string | null;
  /**
   * Legacy field from the old Planning Data integration. PlanWire is now the
   * single source of truth, so this is ignored; accept it only to keep old
   * call sites compiling until they're cleaned up.
   * @deprecated pass `councilId` instead.
   */
  organisationEntity?: string | number | null;
};

/**
 * Council slug + authority reference → PlanWire row, falling back to text
 * search when the slug isn't known. Returns null on miss or when PlanWire is
 * in 429-cooldown so enrichment continues through its other stages.
 */
export async function fetchPlanwireApplication(
  params: FetchPlanwireApplicationParams,
): Promise<PlanwireApplication | null> {
  const { reference, councilId } = params;
  if (!reference.trim()) return null;

  const resolvedCouncil = councilId?.trim() || null;

  if (resolvedCouncil) {
    const app = await fetchPlanwireApplicationByCouncilRef(
      resolvedCouncil,
      reference.trim(),
    );
    if (app) return app;
  }

  return fetchPlanwireApplicationByTextSearch(reference.trim());
}

/**
 * Planwire often returns address and postcode as separate fields. If the
 * address string doesn't already contain the postcode, append it so that
 * downstream consumers (PropertyData UPRN lookup, display, letters) have
 * a complete address.
 */
function appendPostcodeIfMissing(address: string, postcode: string): string {
  if (!address) return postcode || "";
  if (!postcode) return address;
  const pcNorm = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (pcNorm.length < 4) return address;
  const addrUpper = address.toUpperCase().replace(/\s+/g, "");
  if (addrUpper.includes(pcNorm)) return address;
  return `${address.trimEnd()}, ${postcode.trim()}`;
}

/**
 * Convert a PlanWire row into the shared `PlanningApplicationEntity` shape the
 * rest of the app (map, list, modals, agent tools) already speaks. Every
 * surface that used to hit Planning Data now goes through this mapper so the
 * client contract is unchanged.
 *
 * Note: `entity` is a UI identifier (used as a React key and for map markers),
 * so we derive a stable numeric hash from the PlanWire UUID rather than trying
 * to keep a monotonic counter per request.
 */
export function mapPlanwireToPlanningEntity(
  pw: PlanwireApplication,
): PlanningApplicationEntity {
  return {
    entity: planwireIdToEntity(pw.id),
    reference: pw.reference,
    point: Number.isFinite(pw.lng) && Number.isFinite(pw.lat)
      ? `POINT(${pw.lng} ${pw.lat})`
      : undefined,
    "address-text": appendPostcodeIfMissing(pw.address, pw.postcode) || undefined,
    description: pw.description || undefined,
    "planning-application-status": pw.status || undefined,
    "planning-decision-type": pw.decision || undefined,
    "planning-application-type": pw.applicationType || undefined,
    "development-type": pw.developmentType || pw.category || undefined,
    "decision-date": pw.decisionDate || undefined,
    sourceUrl: pw.url || undefined,
    councilId: pw.councilId || undefined,
    postcode: pw.postcode || undefined,
    enrichment: pw.applicant?.name || pw.applicant?.company
      ? {
          applicantName: pw.applicant.name ?? null,
          companyName: pw.applicant.company ?? null,
          agentName: pw.applicant.agent ?? null,
          agentAddress: pw.applicant.agentAddress ?? null,
          source: "planwire",
          confidence: "high" as const,
        }
      : undefined,
  };
}

/** Stable 15-digit numeric hash for PlanWire UUIDs — safe for React keys. */
function planwireIdToEntity(id: string): number {
  const hex = id.replace(/-/g, "").slice(0, 12);
  const n = Number.parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0;
}
