/**
 * Unified outreach contact resolver.
 *
 * Returns a ranked list of candidate addressees for a planning application by
 * calling the enrichment agent (cache-first via `resolveApplicationWithAi`).
 * Both the View Applicant and Proprietor & Letter modals, and the Vercel
 * Workflow autonomous-outreach pipeline, consume the same bundle shape — so
 * work done in one surface is never repeated in another.
 *
 * Land Registry proprietor data is layered in separately on the client (the
 * existing `/api/property/proprietor` POST) because it can incur a charge;
 * callers that already have a proprietor response can pass it in via
 * `mergeProprietor()` to extend the candidate list without a second call.
 */

import {
  resolveApplicationWithAi,
  type EnrichedApplication,
} from "@/lib/ai/agents/enrichment-agent";
import type { ResolvedApplication } from "@/lib/enrichment";

export type OutreachContactKind =
  | "agent"
  | "applicant"
  | "proprietor"
  | "manual";

export type OutreachContact = {
  kind: OutreachContactKind;
  name: string;
  addressLines: string;
  email?: string | null;
  phone?: string | null;
  /** Free-form origin label (e.g. "planwire", "companies_house", "land_registry"). */
  source: string;
  confidence: "low" | "medium" | "high";
};

export type OutreachProprietorInput = {
  proprietorName?: string | null;
  corporateOwner?: string | null;
  proprietorNames?: string[] | null;
  proprietorSource?: string | null;
  matchedAddress?: string | null;
};

export type OutreachContactBundle = {
  reference: string;
  planningEntity: number | null;
  siteAddress: string | null;
  /** Ranked best-first. Never empty — always includes a "Sir or Madam" manual fallback. */
  candidates: OutreachContact[];
  enrichment: EnrichedApplication | null;
  caseOfficer: string | null;
  ward: string | null;
  /** Aggregate of every tool/source the enrichment run touched. */
  sources: string[];
  confidence: "low" | "medium" | "high";
  applicantNamesNotInFeed?: boolean;
  url?: string | null;
  councilWebsite?: string | null;
};

function resolvedToEnriched(r: ResolvedApplication): EnrichedApplication {
  return {
    applicantName: r.applicantName ?? null,
    applicantAddress: r.applicantAddress ?? null,
    applicantEmail: r.applicantEmail ?? null,
    applicantEmailSource: r.applicantEmailSource ?? null,
    applicantEmailConfidence: r.applicantEmailConfidence ?? null,
    applicantEmailStatus: r.applicantEmailStatus ?? null,
    applicantPerson: r.applicantPerson ?? null,
    agentName: r.agentName ?? null,
    agentAddress: r.agentAddress ?? null,
    agentEmail: r.agentEmail ?? null,
    agentEmailSource: r.agentEmailSource ?? null,
    agentEmailConfidence: r.agentEmailConfidence ?? null,
    agentEmailStatus: r.agentEmailStatus ?? null,
    agentPerson: r.agentPerson ?? null,
    agentPhone: r.agentPhone ?? null,
    caseOfficer: r.caseOfficer ?? null,
    ward: r.ward ?? null,
    confidence: r.confidence,
    sources: r.sources ?? [r.source],
  };
}

const WEAK_EMAIL_STATUSES = [
  "invalid",
  "undeliverable",
  "do_not_mail",
  "risky",
];

function isEmailWeak(
  email: string | null | undefined,
  status: string | null | undefined,
  confidence: number | null | undefined,
): boolean {
  if (!email) return true;
  if (
    status != null &&
    WEAK_EMAIL_STATUSES.includes(status.toLowerCase())
  ) {
    return true;
  }
  if (confidence != null && confidence < 50) return true;
  return false;
}

export function rankCandidates(
  enrichment: EnrichedApplication | null,
  siteAddress: string | null,
): OutreachContact[] {
  const out: OutreachContact[] = [];
  const applicantWeak = isEmailWeak(
    enrichment?.applicantEmail,
    enrichment?.applicantEmailStatus,
    enrichment?.applicantEmailConfidence,
  );
  const agentWeak = isEmailWeak(
    enrichment?.agentEmail,
    enrichment?.agentEmailStatus,
    enrichment?.agentEmailConfidence,
  );

  const agentContact: OutreachContact | null = enrichment?.agentName
    ? {
        kind: "agent",
        name: enrichment.agentName,
        addressLines:
          (enrichment.agentAddress ?? "").trim() || (siteAddress ?? "").trim(),
        email: enrichment.agentEmail ?? null,
        phone: enrichment.agentPhone ?? null,
        source: (enrichment.sources ?? []).join("+") || "enrichment",
        confidence: enrichment.confidence,
      }
    : null;
  const applicantContact: OutreachContact | null = enrichment?.applicantName
    ? {
        kind: "applicant",
        name: enrichment.applicantName,
        addressLines:
          (enrichment.applicantAddress ?? "").trim() ||
          (siteAddress ?? "").trim(),
        email: enrichment.applicantEmail ?? null,
        phone: null,
        source: (enrichment.sources ?? []).join("+") || "enrichment",
        confidence: enrichment.confidence,
      }
    : null;

  // Prefer the contact with the stronger email. Agents remain the default
  // B2B contact when quality is equal (typical for planning work).
  if (applicantWeak && !agentWeak) {
    if (agentContact) out.push(agentContact);
    if (applicantContact) out.push(applicantContact);
  } else if (!applicantWeak && agentWeak) {
    if (applicantContact) out.push(applicantContact);
    if (agentContact) out.push(agentContact);
  } else {
    if (agentContact) out.push(agentContact);
    if (applicantContact) out.push(applicantContact);
  }
  return out;
}

const MANUAL_FALLBACK: OutreachContact = {
  kind: "manual",
  name: "Sir or Madam",
  addressLines: "",
  source: "manual",
  confidence: "low",
};

export async function resolveOutreachContact(args: {
  ctx: { companyId: string; userId?: string };
  reference: string;
  planningEntity: number;
  organisationEntity?: string | number | null;
  lpaWebsite?: string | null;
  siteAddress?: string | null;
  forceRefresh?: boolean;
  seed?: {
    applicant?: string | null;
    agent?: string | null;
    agentAddress?: string | null;
  };
}): Promise<OutreachContactBundle> {
  const resolved = await resolveApplicationWithAi({
    reference: args.reference,
    planningEntity: args.planningEntity,
    organisationEntity: args.organisationEntity ?? null,
    lpaWebsite: args.lpaWebsite ?? undefined,
    siteAddress: args.siteAddress ?? undefined,
    companyId: args.ctx.companyId,
    userId: args.ctx.userId,
    seedApplicant: args.seed?.applicant ?? null,
    seedAgent: args.seed?.agent ?? null,
    seedAgentAddress: args.seed?.agentAddress ?? null,
    forceRefresh: args.forceRefresh,
  });

  const enrichment = resolved ? resolvedToEnriched(resolved) : null;
  const siteAddress = args.siteAddress ?? resolved?.siteAddress ?? null;
  const candidates = rankCandidates(enrichment, siteAddress);
  candidates.push({ ...MANUAL_FALLBACK, addressLines: siteAddress ?? "" });

  return {
    reference: args.reference,
    planningEntity: args.planningEntity,
    siteAddress: siteAddress ?? null,
    candidates,
    enrichment,
    caseOfficer: resolved?.caseOfficer ?? null,
    ward: resolved?.ward ?? null,
    sources: resolved?.sources ?? (resolved ? [resolved.source] : []),
    confidence: resolved?.confidence ?? "low",
    applicantNamesNotInFeed: resolved?.applicantNamesNotInFeed,
    url: resolved?.url ?? null,
    councilWebsite: resolved?.councilWebsite ?? null,
  };
}

/**
 * Extend an existing bundle with Land Registry proprietor candidate(s). Called
 * client-side after the user presses "Find proprietor" in the letter modal so
 * we don't make PropertyData requests unless explicitly asked (they can cost
 * money).
 */
export function mergeProprietor(
  bundle: OutreachContactBundle,
  input: OutreachProprietorInput,
  fallbackAddress: string,
): OutreachContactBundle {
  const names: string[] = [];
  if (input.proprietorName) names.push(input.proprietorName);
  if (input.corporateOwner && input.corporateOwner !== input.proprietorName) {
    names.push(input.corporateOwner);
  }
  for (const n of input.proprietorNames ?? []) {
    if (!names.includes(n)) names.push(n);
  }
  if (names.length === 0) return bundle;

  const address = input.matchedAddress?.trim() || fallbackAddress;
  const source = input.proprietorSource ?? "land_registry";
  const newCandidates: OutreachContact[] = names.map((name) => ({
    kind: "proprietor",
    name,
    addressLines: address,
    source,
    confidence: "high",
  }));

  const withoutManual = bundle.candidates.filter((c) => c.kind !== "manual");
  const manual = bundle.candidates.find((c) => c.kind === "manual");
  return {
    ...bundle,
    candidates: [
      ...withoutManual,
      ...newCandidates,
      ...(manual ? [manual] : []),
    ],
  };
}

/** Stable key for radio-group `value`. */
export function contactKey(c: OutreachContact): string {
  return `${c.kind}:${c.name}:${c.source}`;
}
