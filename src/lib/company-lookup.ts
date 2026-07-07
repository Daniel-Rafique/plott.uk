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
 *   company name → Companies House match → officers (addressee) + registered
 *   office → Hunter (domain search / email finder) → verified email.
 *
 * Every step fails closed (returns null / empty) when a key is missing or an
 * upstream call errors — it must never throw into a request path.
 */

import {
  isCompaniesHouseConfigured,
  searchCompanies,
  getCompanyProfile,
  getCompanyOfficers,
  type CompaniesHouseSearchResult,
} from "@/lib/ai/tools/companies-house";
import {
  hunterDomainSearch,
  hunterEmailFinder,
  hunterEmailVerifier,
} from "@/lib/ai/tools/hunter";
import { logger } from "@/lib/logger";

const COMPANY_SUFFIX_RE =
  /\b(ltd|limited|llp|plc|l\.?t\.?d\.?|c\.?i\.?c\.?|company|holdings|group|developments?|homes|properties|construction|builders?|associates|partnership|estates?|investments?|ventures?|studios?|architects?|surveyors?)\b/i;

/** Heuristic: does this name look like a UK registered company? */
export function looksLikeCompany(name: string | null | undefined): boolean {
  return Boolean(name && COMPANY_SUFFIX_RE.test(name));
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

async function resolveHunterEmail(args: {
  company: string;
  personName: string | null;
}): Promise<{ email: string; confidence: number | null; status: string } | null> {
  try {
    const domainSearch = await hunterDomainSearch({
      company: args.company,
      limit: 10,
    });
    if (!domainSearch.configured) return null;
    const domain = domainSearch.domain;

    // Targeted lookup when we have a named officer and a resolved domain.
    if (args.personName && domain) {
      const finder = await hunterEmailFinder({
        domain,
        fullName: args.personName,
      });
      if (finder.configured && finder.found && finder.email) {
        return {
          email: finder.email,
          confidence: finder.score,
          status: finder.status ?? "found",
        };
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

    // Verify generic/domain hits so we don't store a bounce.
    let status = "unverified";
    try {
      const verified = await hunterEmailVerifier(preferred.email);
      if (verified.configured) status = verified.status ?? status;
    } catch {
      /* verifier is best-effort */
    }
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

/**
 * Resolve a company name to an addressee, registered office and (optionally) an
 * email — deterministically, no LLM. Returns null when the name isn't
 * company-shaped, Companies House isn't configured, or nothing matched.
 */
export async function resolveCompanyContact(
  rawName: string,
  opts: {
    /** A known human name to target the Hunter email finder. */
    personName?: string | null;
    /** Skip the Hunter step (e.g. when an email is already known). */
    needEmail?: boolean;
  } = {},
): Promise<CompanyContact | null> {
  const name = rawName?.trim();
  if (!name || !looksLikeCompany(name) || !isCompaniesHouseConfigured()) {
    return null;
  }

  try {
    const candidates = await searchCompanies(name, 5);
    const best = pickBestCompany(name, candidates);
    if (!best || best.score === 0) return null;

    const number = best.company.number;
    const [profile, officers] = await Promise.all([
      getCompanyProfile(number),
      getCompanyOfficers(number),
    ]);

    const companyName = profile?.name ?? best.company.name;
    const officer =
      officers.find((o) => /director/i.test(o.role)) ??
      officers.find((o) => /secretary|member|partner/i.test(o.role)) ??
      officers[0] ??
      null;
    const contactName = officer
      ? `${officer.name}, ${titleCaseRole(officer.role)}`
      : null;

    const registered = profile?.registeredAddress ?? best.company.address;
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
      status: profile?.status ?? best.company.status,
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
