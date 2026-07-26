/**
 * Deterministic company-contact resolution.
 *
 * Both the research briefing agent and the enrichment agent used to rely on the
 * LLM to (a) look a company up on Companies House and (b) chase an email via
 * Hunter. The model frequently skips those tool calls and shortcuts to "no
 * records found", which also starves Hunter of the company/domain context it
 * needs. This module resolves the whole chain WITHOUT the model so the happy
 * path is reliable and cheap:
 *
 *   company name (+ optional address) → Companies House match → officers
 *   (addressee) + registered office → Hunter (domain search / email finder)
 *   → verified email.
 *
 * Every step fails closed (returns null / empty) when a key is missing or an
 * upstream call errors — it must never throw into a request path.
 */

import {
  isCompaniesHouseConfigured,
  searchCompanies,
  advancedSearchCompanies,
  getCompanyProfile,
  getCompanyOfficers,
  type CompaniesHouseSearchResult,
} from "@/lib/ai/tools/companies-house";
import {
  hunterCompanyEnrichment,
  hunterDomainSearch,
  hunterEmailFinder,
  hunterEmailVerifier,
} from "@/lib/ai/tools/hunter";
import { logger } from "@/lib/logger";

const COMPANY_SUFFIX_RE =
  /\b(ltd|limited|llp|plc|l\.?t\.?d\.?|c\.?i\.?c\.?|company|holdings|group|developments?|homes|properties|construction|builders?|associates|partnership|estates?|investments?|ventures?|studios?|architects?|architecture|surveyors?|consultants?|consultancy|services)\b/i;

const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

const ADDRESS_STOP_WORDS = new Set([
  "road",
  "rd",
  "street",
  "st",
  "lane",
  "ln",
  "avenue",
  "ave",
  "drive",
  "dr",
  "close",
  "court",
  "ct",
  "place",
  "pl",
  "way",
  "house",
  "floor",
  "unit",
  "suite",
  "the",
  "and",
  "of",
  "uk",
  "england",
  "wales",
  "scotland",
  "london",
]);

const HUNTER_MIN_CONFIDENCE = 50;
const HUNTER_WEAK_STATUSES = new Set([
  "invalid",
  "undeliverable",
  "do_not_mail",
  "risky",
]);

/**
 * Short ALL-CAPS trading names (e.g. "NLA") from planning feeds are companies,
 * not people — without this, enrichment treats them as named persons and never
 * replaces them with a Companies House director / full company name.
 */
export function looksLikeAcronymCompany(
  name: string | null | undefined,
): boolean {
  if (!name) return false;
  const compact = name.trim().replace(/[.\s]+/g, "");
  if (compact.length < 2 || compact.length > 4) return false;
  if (!/^[A-Za-z]+$/.test(compact)) return false;
  // Require mostly uppercase so short names like "Ann" / "Jon" stay people.
  const letters = compact.split("");
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  return upper === letters.length;
}

/** Heuristic: does this name look like a UK registered company? */
export function looksLikeCompany(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  if (COMPANY_SUFFIX_RE.test(name)) return true;
  return looksLikeAcronymCompany(name);
}

/**
 * Loose comparison to pick the best Companies House hit for a name. Strips the
 * usual corporate noise so "Star Plans Ltd" matches "STAR PLANS LTD".
 */
export function scoreNameMatch(query: string, candidate: string): number {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(COMPANY_SUFFIX_RE, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const q = clean(query);
  const c = clean(candidate);
  if (!q || !c) return 0;
  if (q === c) return 3;
  if (c.startsWith(q) || q.startsWith(c)) return 2;
  if (c.includes(q) || q.includes(c)) return 1;
  return 0;
}

/** Best candidate by name score, tie-broken toward active companies. */
export function pickBestCompany(
  query: string,
  candidates: CompaniesHouseSearchResult[],
): { company: CompaniesHouseSearchResult; score: number } | null {
  if (candidates.length === 0) return null;
  const ranked = candidates
    .map((c) => ({ company: c, score: scoreNameMatch(query, c.name) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aActive = a.company.status === "active" ? 1 : 0;
      const bActive = b.company.status === "active" ? 1 : 0;
      return bActive - aActive;
    });
  return ranked[0] ?? null;
}

/** Normalise a UK postcode for equality checks (uppercase, single space). */
export function extractUkPostcode(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const match = raw.match(UK_POSTCODE_RE);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, " ").toUpperCase();
}

/**
 * Location string for Companies House advanced search — prefer a postcode,
 * otherwise a short street/locality fragment.
 */
export function locationForChSearch(
  address: string | null | undefined,
): string | null {
  const postcode = extractUkPostcode(address);
  if (postcode) return postcode;
  const cleaned = (address ?? "")
    .replace(/\n+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 4) return null;
  return cleaned.slice(0, 80);
}

function addressTokens(raw: string): Set<string> {
  return new Set(
    raw
      .toLowerCase()
      .replace(UK_POSTCODE_RE, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !ADDRESS_STOP_WORDS.has(t)),
  );
}

/**
 * Score how well a CH registered-office / address snippet matches a known
 * party address. Postcode equality is strongest; street tokens add secondary
 * signal. Returns 0 when addresses clearly diverge (different postcodes).
 */
export function scoreAddressMatch(
  knownAddress: string,
  candidateAddress: string,
): number {
  const known = knownAddress.trim();
  const candidate = candidateAddress.trim();
  if (!known || !candidate) return 0;

  const knownPc = extractUkPostcode(known);
  const candidatePc = extractUkPostcode(candidate);
  if (knownPc && candidatePc && knownPc !== candidatePc) return 0;

  let score = 0;
  if (knownPc && candidatePc && knownPc === candidatePc) score += 3;

  const knownTokens = addressTokens(known);
  const candidateTokens = addressTokens(candidate);
  let overlap = 0;
  for (const token of knownTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }
  score += Math.min(overlap, 3);
  return score;
}

/**
 * Pick the best CH candidate using address match first, then name score,
 * then active status. Requires a non-zero address score when grounding on
 * a known address.
 */
export function pickBestCompanyByAddress(
  query: string,
  knownAddress: string,
  candidates: CompaniesHouseSearchResult[],
): {
  company: CompaniesHouseSearchResult;
  nameScore: number;
  addressScore: number;
} | null {
  if (candidates.length === 0) return null;
  const ranked = candidates
    .map((c) => ({
      company: c,
      nameScore: scoreNameMatch(query, c.name),
      addressScore: scoreAddressMatch(knownAddress, c.address),
    }))
    .filter((r) => r.addressScore > 0)
    .sort((a, b) => {
      if (b.addressScore !== a.addressScore) {
        return b.addressScore - a.addressScore;
      }
      if (b.nameScore !== a.nameScore) return b.nameScore - a.nameScore;
      const aActive = a.company.status === "active" ? 1 : 0;
      const bActive = b.company.status === "active" ? 1 : 0;
      return bActive - aActive;
    });
  const best = ranked[0];
  if (!best || best.addressScore < 2) return null;
  return best;
}

function titleCaseRole(role: string): string {
  return role
    .split(/[-_\s]+/)
    .map((w) =>
      w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

export type CompanyContact = {
  companyName: string;
  companyNumber: string;
  status: string;
  /** Best addressee, e.g. "Jane Doe, Director" — null when no active officers. */
  contactName: string | null;
  /** "{Company}, {registered office}" for letters. */
  address: string | null;
  email: string | null;
  emailSource: "hunter" | null;
  emailConfidence: number | null;
  emailStatus: string | null;
  sources: string[];
};

function domainFromEmail(email: string | null | undefined): string | null {
  if (!email?.includes("@")) return null;
  const host = email.split("@")[1]?.trim().toLowerCase();
  return host || null;
}

function isAcceptableHunterHit(
  confidence: number | null | undefined,
  status: string | null | undefined,
): boolean {
  if (confidence != null && confidence < HUNTER_MIN_CONFIDENCE) return false;
  if (status && HUNTER_WEAK_STATUSES.has(status.toLowerCase())) return false;
  return true;
}

async function verifyHunterStatus(email: string): Promise<string> {
  try {
    const verified = await hunterEmailVerifier(email);
    if (verified.configured) return verified.status ?? "unverified";
  } catch {
    /* verifier is best-effort */
  }
  return "unverified";
}

/**
 * Resolve an email for a company (and optional named person) via Hunter.
 * Prefer calling this with a Companies House legal name — Domain Search on
 * bare acronyms produces global false positives.
 */
export async function resolveHunterEmail(args: {
  company: string;
  personName: string | null;
}): Promise<{ email: string; confidence: number | null; status: string } | null> {
  try {
    const domainSearch = await hunterDomainSearch({
      company: args.company,
      limit: 10,
    });
    if (!domainSearch.configured) return null;

    let domain =
      domainSearch.domain ??
      domainFromEmail(domainSearch.results?.[0]?.email) ??
      null;

    // Domain Search sometimes returns emails without a top-level domain field;
    // Company Enrichment can confirm/resolve when we still lack a domain.
    if (!domain) {
      const enriched = await hunterCompanyEnrichment({ company: args.company });
      if (enriched.configured && enriched.domain) {
        domain = enriched.domain;
      }
    }

    // Targeted lookup when we have a named person — Email Finder accepts
    // company without domain, so still try when domain resolution failed.
    if (args.personName) {
      const finder = await hunterEmailFinder({
        domain: domain ?? undefined,
        company: args.company,
        fullName: args.personName,
      });
      if (finder.configured && finder.found && finder.email) {
        let status = finder.status ?? "found";
        if (!finder.status) {
          status = await verifyHunterStatus(finder.email);
        }
        if (isAcceptableHunterHit(finder.score, status)) {
          return {
            email: finder.email,
            confidence: finder.score,
            status,
          };
        }
      }
    }

    // Fall back to the strongest email from the domain search.
    const emails = domainSearch.results ?? [];
    if (emails.length === 0) return null;
    const sorted = [...emails].sort(
      (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
    );
    const preferred = sorted.find((e) => e.type === "personal") ?? sorted[0];
    if (!preferred?.email) return null;

    const status = await verifyHunterStatus(preferred.email);
    if (!isAcceptableHunterHit(preferred.confidence, status)) return null;

    return {
      email: preferred.email,
      confidence: preferred.confidence,
      status,
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), company: args.company },
      "hunter_email_resolve_failed",
    );
    return null;
  }
}

async function findCompaniesHouseMatch(
  name: string,
  address?: string | null,
): Promise<CompaniesHouseSearchResult | null> {
  const knownAddress = address?.trim() || null;

  if (knownAddress) {
    const location = locationForChSearch(knownAddress);
    if (location) {
      const advanced = await advancedSearchCompanies({
        location,
        companyNameIncludes: name,
        status: "active",
        size: 20,
      });
      const bestAdvanced = pickBestCompanyByAddress(
        name,
        knownAddress,
        advanced,
      );
      if (bestAdvanced) return bestAdvanced.company;
    }

    // Advanced search can miss; fall back to name search and still require
    // the candidate's registered office to match the known address.
    const byName = await searchCompanies(name, 10);
    const bestNamed = pickBestCompanyByAddress(name, knownAddress, byName);
    if (bestNamed) return bestNamed.company;

    // Address was supplied but nothing grounded — fail closed.
    return null;
  }

  const candidates = await searchCompanies(name, 5);
  const best = pickBestCompany(name, candidates);
  if (!best || best.score === 0) return null;
  return best.company;
}

/**
 * Resolve a company name to an addressee, registered office and (optionally) an
 * email — deterministically, no LLM. Returns null when the name isn't
 * company-shaped, Companies House isn't configured, or nothing matched.
 *
 * When `address` is provided, Companies House is searched by location first and
 * only companies whose registered office matches that address are accepted —
 * Hunter then receives the CH legal name, never a bare feed acronym alone.
 */
export async function resolveCompanyContact(
  rawName: string,
  opts: {
    /** A known human name to target the Hunter email finder. */
    personName?: string | null;
    /** Skip the Hunter step (e.g. when an email is already known). */
    needEmail?: boolean;
    /**
     * Party-specific address (agent/applicant), used to ground CH search.
     * Do not pass the planning site address for agents.
     */
    address?: string | null;
  } = {},
): Promise<CompanyContact | null> {
  const name = rawName?.trim();
  if (!name || !looksLikeCompany(name) || !isCompaniesHouseConfigured()) {
    return null;
  }

  try {
    const matched = await findCompaniesHouseMatch(name, opts.address);
    if (!matched) return null;

    const number = matched.number;
    const [profile, officers] = await Promise.all([
      getCompanyProfile(number),
      getCompanyOfficers(number),
    ]);

    const companyName = profile?.name ?? matched.name;
    const officer =
      officers.find((o) => /director/i.test(o.role)) ??
      officers.find((o) => /secretary|member|partner/i.test(o.role)) ??
      officers[0] ??
      null;
    const contactName = officer
      ? `${officer.name}, ${titleCaseRole(officer.role)}`
      : null;

    const registered = profile?.registeredAddress ?? matched.address;
    const address = registered ? `${companyName}, ${registered}` : companyName;

    const sources = ["companies_house"];
    let email: string | null = null;
    let emailSource: "hunter" | null = null;
    let emailConfidence: number | null = null;
    let emailStatus: string | null = null;

    if (opts.needEmail !== false) {
      const hunter = await resolveHunterEmail({
        company: companyName,
        personName: opts.personName ?? officer?.name ?? null,
      });
      if (hunter) {
        email = hunter.email;
        emailSource = "hunter";
        emailConfidence = hunter.confidence;
        emailStatus = hunter.status;
        sources.push("hunter");
      }
    }

    return {
      companyName,
      companyNumber: number,
      status: profile?.status ?? matched.status,
      contactName,
      address,
      email,
      emailSource,
      emailConfidence,
      emailStatus,
      sources,
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), name },
      "company_contact_resolve_failed",
    );
    return null;
  }
}
