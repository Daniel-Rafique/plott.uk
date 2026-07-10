/**
 * Applicant/agent enrichment cascade.
 *
 * Resolution order per application reference:
 *   1. Postgres cache (ApplicationEnrichment, 30-day TTL).
 *   2. PlanWire ref lookup (council slug + reference).
 *   3. LPA portal scraper (Idox / Civica / Northgate).
 *
 * Land Registry proprietor lookup is a separate paid, user-triggered flow.
 *
 * Returns whatever partials are available, tagged with `source` + `confidence`.
 */

import { prisma } from "@/lib/prisma";
import {
  fetchPlanwireApplication,
  isPlanwireInCooldown,
  type PlanwireApplication,
} from "@/lib/planwire";
import { scrapeLpaPortal, type LpaPortalResult } from "@/lib/lpa-portal";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import {
  looksLikeCompany,
  resolveCompanyContact,
  type CompanyContact,
} from "@/lib/company-lookup";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ResolvedApplication = {
  applicationRef: string;
  planningEntity?: number | null;
  organisationEntity?: string | number | null;
  siteAddress?: string;
  applicantName?: string | null;
  applicantAddress?: string | null;
  applicantEmail?: string | null;
  applicantEmailSource?: string | null;
  applicantEmailConfidence?: number | null;
  applicantEmailStatus?: string | null;
  companyName?: string | null;
  agentName?: string | null;
  agentAddress?: string | null;
  agentPhone?: string | null;
  agentEmail?: string | null;
  caseOfficer?: string | null;
  ward?: string | null;
  receivedDate?: string | null;
  targetDate?: string | null;
  url?: string | null;
  councilWebsite?: string | null;
  source: "cache" | "planwire" | "lpa_portal" | "composite" | "hunter";
  confidence: "low" | "medium" | "high";
  applicantNamesNotInFeed?: boolean;
  sources?: string[];
};

export type ResolveParams = {
  reference: string;
  planningEntity?: number;
  organisationEntity?: string | number | null;
  councilId?: string | null;
  lpaWebsite?: string | null;
  siteAddress?: string;
  seedApplicant?: string | null;
  seedAgent?: string | null;
  /** Skip Postgres enrichment cache and re-fetch upstream sources. */
  forceRefresh?: boolean;
};

function hasNamedPerson(name: string | null | undefined): boolean {
  return Boolean(name && !looksLikeCompany(name));
}

function pickApplicantCompany(
  r: ResolvedApplication,
  seeds?: Pick<ResolveParams, "seedApplicant">,
): string | null {
  if (r.companyName?.trim()) return r.companyName.trim();
  if (looksLikeCompany(r.applicantName)) return r.applicantName!.trim();
  if (looksLikeCompany(seeds?.seedApplicant)) return seeds!.seedApplicant!.trim();
  return null;
}

function pickAgentCompany(
  r: ResolvedApplication,
  seeds?: Pick<ResolveParams, "seedAgent">,
): string | null {
  if (looksLikeCompany(r.agentName)) return r.agentName!.trim();
  if (looksLikeCompany(seeds?.seedAgent)) return seeds!.seedAgent!.trim();
  return null;
}

/** Strip ", Director" suffix so Hunter email finder gets a clean full name. */
function personNameForHunter(name: string): string {
  return name.replace(/,\s*(director|secretary|member|partner).*$/i, "").trim();
}

function mergeApplicantCompanyContact(
  r: ResolvedApplication,
  contact: CompanyContact,
  opts: { fillName: boolean; fillAddress: boolean; fillEmail: boolean },
): ResolvedApplication {
  const sources = Array.from(
    new Set([...(r.sources ?? [r.source]), ...contact.sources]),
  );
  const hasAddress = Boolean(r.applicantAddress ?? contact.address);
  const hasName = Boolean(
    (opts.fillName ? contact.contactName : r.applicantName) ??
      contact.companyName,
  );
  return {
    ...r,
    companyName: contact.companyName,
    applicantName: opts.fillName
      ? (contact.contactName ?? r.applicantName ?? contact.companyName)
      : r.applicantName,
    applicantAddress: opts.fillAddress
      ? (r.applicantAddress ?? contact.address)
      : r.applicantAddress,
    applicantEmail: opts.fillEmail
      ? (r.applicantEmail ?? contact.email)
      : r.applicantEmail,
    applicantEmailSource: opts.fillEmail
      ? (r.applicantEmailSource ?? contact.emailSource)
      : r.applicantEmailSource,
    applicantEmailConfidence: opts.fillEmail
      ? (r.applicantEmailConfidence ?? contact.emailConfidence)
      : r.applicantEmailConfidence,
    applicantEmailStatus: opts.fillEmail
      ? (r.applicantEmailStatus ?? contact.emailStatus)
      : r.applicantEmailStatus,
    source: contact.email ? "hunter" : r.source === "cache" ? "composite" : r.source,
    confidence:
      hasName && hasAddress
        ? "high"
        : hasName
          ? "medium"
          : r.confidence,
    sources,
  };
}

function mergeAgentCompanyContact(
  r: ResolvedApplication,
  contact: CompanyContact,
  opts: { fillAddress: boolean; fillEmail: boolean },
): ResolvedApplication {
  const sources = Array.from(
    new Set([...(r.sources ?? [r.source]), ...contact.sources]),
  );
  return {
    ...r,
    agentName: r.agentName ?? contact.companyName,
    agentAddress: opts.fillAddress
      ? (r.agentAddress ?? contact.address)
      : r.agentAddress,
    agentEmail: opts.fillEmail ? (r.agentEmail ?? contact.email) : r.agentEmail,
    source: contact.email && !r.applicantEmail ? "hunter" : r.source,
    confidence:
      (r.agentName || contact.companyName) && (r.agentAddress || contact.address)
        ? "high"
        : r.confidence,
    sources,
  };
}

/**
 * Deterministic Companies House + Hunter pass. Runs without the LLM so corporate
 * applicants get a named director addressee and (when configured) a Hunter email.
 */
export async function enrichFromCompanyLookup(
  r: ResolvedApplication,
  seeds?: Pick<ResolveParams, "seedApplicant" | "seedAgent">,
): Promise<ResolvedApplication> {
  let out = r;
  const hunterConfigured = Boolean(process.env.HUNTER_API_KEY?.trim());

  const applicantCompany = pickApplicantCompany(out, seeds);
  if (applicantCompany) {
    const fillName =
      !hasNamedPerson(out.applicantName) || looksLikeCompany(out.applicantName);
    const fillAddress = !out.applicantAddress;
    const fillEmail = hunterConfigured && !out.applicantEmail;
    if (fillName || fillAddress || fillEmail) {
      const contact = await resolveCompanyContact(applicantCompany, {
        needEmail: fillEmail,
        personName: hasNamedPerson(out.applicantName)
          ? personNameForHunter(out.applicantName!)
          : null,
      });
      if (contact) {
        out = mergeApplicantCompanyContact(out, contact, {
          fillName,
          fillAddress,
          fillEmail,
        });
      }
    }
  }

  const agentCompany = pickAgentCompany(out, seeds);
  if (agentCompany) {
    const fillAddress = !out.agentAddress;
    const fillEmail = hunterConfigured && !out.agentEmail;
    if (fillAddress || fillEmail) {
      const contact = await resolveCompanyContact(agentCompany, {
        needEmail: fillEmail,
      });
      if (contact) {
        out = mergeAgentCompanyContact(out, contact, { fillAddress, fillEmail });
      }
    }
  }

  return out;
}

function fromPlanwire(
  p: PlanwireApplication,
  applicationRef: string,
): ResolvedApplication {
  return {
    applicationRef,
    applicantName: p.applicant?.name ?? null,
    companyName: p.applicant?.company ?? null,
    agentName: p.applicant?.agent ?? null,
    agentAddress: p.applicant?.agentAddress ?? null,
    url: p.url ?? null,
    councilWebsite: p.councilWebsite ?? null,
    applicantNamesNotInFeed: p.applicantNamesNotInFeed,
    source: "planwire",
    confidence: p.applicant?.name ? "high" : "low",
    sources: ["planwire"],
  };
}

function fromLpa(
  p: LpaPortalResult,
  applicationRef: string,
): ResolvedApplication {
  return {
    applicationRef,
    applicantName: p.applicantName ?? null,
    applicantAddress: p.applicantAddress ?? null,
    agentName: p.agentName ?? null,
    agentAddress: p.agentAddress ?? null,
    agentPhone: p.agentPhone ?? null,
    agentEmail: p.agentEmail ?? null,
    caseOfficer: p.caseOfficer ?? null,
    ward: p.ward ?? null,
    receivedDate: p.receivedDate ?? null,
    targetDate: p.targetDate ?? null,
    url: p.sourceUrl ?? null,
    source: "lpa_portal",
    confidence: p.applicantName || p.agentName ? "high" : "medium",
    sources: ["lpa_portal"],
  };
}

function mergeResolved(
  primary: ResolvedApplication,
  secondary: ResolvedApplication,
): ResolvedApplication {
  const pick = <K extends keyof ResolvedApplication>(k: K) =>
    primary[k] ?? secondary[k];
  return {
    ...primary,
    applicantName: pick("applicantName"),
    applicantAddress: pick("applicantAddress"),
    applicantEmail: pick("applicantEmail"),
    applicantEmailSource: pick("applicantEmailSource"),
    applicantEmailConfidence: pick("applicantEmailConfidence"),
    applicantEmailStatus: pick("applicantEmailStatus"),
    companyName: pick("companyName"),
    agentName: pick("agentName"),
    agentAddress: pick("agentAddress"),
    agentPhone: pick("agentPhone"),
    agentEmail: pick("agentEmail"),
    caseOfficer: pick("caseOfficer"),
    ward: pick("ward"),
    receivedDate: pick("receivedDate"),
    targetDate: pick("targetDate"),
    url: pick("url"),
    councilWebsite: pick("councilWebsite"),
    applicantNamesNotInFeed:
      primary.applicantNamesNotInFeed && secondary.applicantNamesNotInFeed,
    source: "composite",
    confidence:
      primary.applicantName || secondary.applicantName ? "high" : "medium",
    sources: [...(primary.sources ?? []), ...(secondary.sources ?? [])],
  };
}

async function readFromCache(
  planningEntity: number | undefined,
  reference: string,
): Promise<ResolvedApplication | null> {
  if (planningEntity != null) {
    const row = await prisma.applicationEnrichment.findUnique({
      where: { planningEntity: BigInt(planningEntity) },
    });
    if (row && row.expiresAt > new Date()) {
      return {
        applicationRef: row.applicationRef ?? reference,
        planningEntity: Number(row.planningEntity),
        organisationEntity: row.organisationEntity ?? null,
        applicantName: row.applicantName,
        applicantAddress: row.applicantAddress,
        applicantEmail: row.applicantEmail,
        applicantEmailSource: row.applicantEmailSource,
        applicantEmailConfidence: row.applicantEmailConfidence,
        applicantEmailStatus: row.applicantEmailStatus,
        agentName: row.agentName,
        agentAddress: row.agentAddress,
        agentPhone: row.agentPhone,
        agentEmail: row.agentEmail,
        caseOfficer: row.caseOfficer,
        ward: row.ward,
        receivedDate: row.receivedDate?.toISOString() ?? null,
        targetDate: row.targetDate?.toISOString() ?? null,
        source: "cache",
        confidence:
          row.confidence === "high" || row.confidence === "medium"
            ? row.confidence
            : "low",
        sources: [row.source],
      };
    }
  }
  return null;
}

export async function writeResolvedApplicationToCache(
  r: ResolvedApplication,
  ttlMs = DEFAULT_TTL_MS,
): Promise<void> {
  if (r.planningEntity == null) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  await prisma.applicationEnrichment
    .upsert({
      where: { planningEntity: BigInt(r.planningEntity) },
      create: {
        planningEntity: BigInt(r.planningEntity),
        applicationRef: r.applicationRef,
        organisationEntity: r.organisationEntity
          ? String(r.organisationEntity)
          : null,
        applicantName: r.applicantName ?? null,
        applicantAddress: r.applicantAddress ?? null,
        applicantEmail: r.applicantEmail ?? null,
        applicantEmailSource: r.applicantEmailSource ?? null,
        applicantEmailConfidence: r.applicantEmailConfidence ?? null,
        applicantEmailStatus: r.applicantEmailStatus ?? null,
        agentName: r.agentName ?? null,
        agentAddress: r.agentAddress ?? null,
        agentPhone: r.agentPhone ?? null,
        agentEmail: r.agentEmail ?? null,
        caseOfficer: r.caseOfficer ?? null,
        ward: r.ward ?? null,
        receivedDate: r.receivedDate ? new Date(r.receivedDate) : null,
        targetDate: r.targetDate ? new Date(r.targetDate) : null,
        source: r.source,
        confidence: r.confidence,
        fetchedAt: now,
        expiresAt,
      },
      update: {
        applicantName: r.applicantName ?? undefined,
        applicantAddress: r.applicantAddress ?? undefined,
        applicantEmail: r.applicantEmail ?? undefined,
        applicantEmailSource: r.applicantEmailSource ?? undefined,
        applicantEmailConfidence: r.applicantEmailConfidence ?? undefined,
        applicantEmailStatus: r.applicantEmailStatus ?? undefined,
        agentName: r.agentName ?? undefined,
        agentAddress: r.agentAddress ?? undefined,
        agentPhone: r.agentPhone ?? undefined,
        agentEmail: r.agentEmail ?? undefined,
        caseOfficer: r.caseOfficer ?? undefined,
        ward: r.ward ?? undefined,
        source: r.source,
        confidence: r.confidence,
        fetchedAt: now,
        expiresAt,
      },
    })
    .catch(() => {
      /* swallow — cache write failures should never break the request */
    });
}

export async function resolveApplication(
  params: ResolveParams,
): Promise<ResolvedApplication | null> {
  const applicationRef = params.reference.trim();
  if (!applicationRef) return null;

  const cached = params.forceRefresh
    ? null
    : await readFromCache(params.planningEntity, applicationRef);
  const hunterConfigured = Boolean(process.env.HUNTER_API_KEY?.trim());
  if (cached?.applicantName) {
    const emailSatisfied =
      !hunterConfigured || Boolean(cached.applicantEmail || cached.agentEmail);
    if (emailSatisfied) return cached;
  } else if (cached) {
    // Partial cache (e.g. company name only) — fall through to enrich gaps.
  }

  let composite: ResolvedApplication | null = cached;

  // Skip PlanWire if we're already in the rate-limit cooldown — no point
  // waiting for a request we know will return null.
  const planwire = isPlanwireInCooldown().cooldown
    ? null
    : await fetchPlanwireApplication({
        reference: applicationRef,
        councilId: params.councilId ?? undefined,
        organisationEntity: params.organisationEntity ?? undefined,
      });
  if (planwire) {
    const r = fromPlanwire(planwire, applicationRef);
    composite = composite ? mergeResolved(r, composite) : r;
    if (!composite.applicantName && planwire.councilWebsite) {
      params.lpaWebsite = params.lpaWebsite ?? planwire.councilWebsite;
    }
  }

  if (!composite?.applicantName) {
    const website = params.lpaWebsite ?? null;
    if (website) {
      try {
        const portal = await scrapeLpaPortal({
          councilWebsite: website,
          reference: applicationRef,
        });
        if (portal) {
          const r = fromLpa(portal, applicationRef);
          composite = composite ? mergeResolved(r, composite) : r;
        }
      } catch {
        /* scraper failures should never break the request */
      }
    }
  }

  // Seed-only path: listing row may already carry a corporate applicant/agent
  // name even when PlanWire + LPA portal return nothing.
  if (!composite && (params.seedApplicant || params.seedAgent)) {
    composite = {
      applicationRef,
      applicantName: params.seedApplicant ?? null,
      agentName: params.seedAgent ?? null,
      source: "composite",
      confidence: "low",
      sources: ["row_seed"],
    };
  } else if (composite && !composite.applicantName && params.seedApplicant) {
    composite = {
      ...composite,
      applicantName: params.seedApplicant,
      sources: [...(composite.sources ?? [composite.source]), "row_seed"],
    };
  }

  if (composite) {
    composite = await enrichFromCompanyLookup(composite, {
      seedApplicant: params.seedApplicant,
      seedAgent: params.seedAgent,
    });
    composite.planningEntity = params.planningEntity ?? null;
    composite.organisationEntity = params.organisationEntity ?? null;
    composite.siteAddress = params.siteAddress;
    await writeResolvedApplicationToCache(composite);
  }

  return composite;
}

/**
 * Opportunistic bulk enrichment for the search results list. Failures are
 * silent; returns entities in the original order with an optional
 * `enrichment` property.
 *
 * Concurrency is capped so we don't fan out 50+ PlanWire requests per search
 * and trip their rate limit. 4 in flight at a time comfortably stays under
 * PlanWire's free-tier bucket while still saturating the 2s budget.
 */
const ENRICHMENT_CONCURRENCY = 4;

export async function enrichSearchResults(
  entities: PlanningApplicationEntity[],
  opts: { budgetMs?: number } = {},
): Promise<PlanningApplicationEntity[]> {
  const budget = opts.budgetMs ?? 2000;
  const deadline = Date.now() + budget;
  const out: PlanningApplicationEntity[] = entities.slice();

  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= entities.length) return;
      if (Date.now() >= deadline) return;
      const e = entities[i];
      if (!e.reference) continue;
      const remaining = deadline - Date.now();
      if (remaining <= 100) return;

      try {
        const result = await Promise.race<ResolvedApplication | null>([
          resolveApplication({
            reference: e.reference,
            planningEntity: e.entity,
            organisationEntity: e["organisation-entity"] ?? null,
            siteAddress: e["address-text"],
          }),
          new Promise((resolve) => setTimeout(() => resolve(null), remaining)),
        ]);
        if (result) {
          out[i] = {
            ...e,
            enrichment: {
              applicantName: result.applicantName ?? null,
              applicantEmail: result.applicantEmail ?? null,
              companyName: result.companyName ?? null,
              agentName: result.agentName ?? null,
              agentAddress: result.agentAddress ?? null,
              agentEmail: result.agentEmail ?? null,
              source: result.source,
              confidence: result.confidence,
            },
          };
        }
      } catch {
        /* swallow */
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(ENRICHMENT_CONCURRENCY, entities.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}
