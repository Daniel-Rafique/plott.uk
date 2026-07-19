/**
 * Agentic enrichment.
 *
 * The top-level entry point (`resolveApplicationWithAi`) runs the deterministic
 * cascade (cache → PlanWire → LPA portal) FIRST, then only invokes the LLM
 * agent when the cascade left gaps that Companies House or the open web can
 * plausibly fill. This keeps the happy path <3s and prevents us burning the
 * 45s gateway budget on lookups we could have done ourselves.
 *
 * When the agent DOES run, it starts with the cascade's partial result as
 * ground-truth context so it doesn't redo work. If the gateway times out or
 * the model errors, we return the cascade result rather than re-running the
 * entire chain — which is how we used to produce 60s+ requests and
 * GatewayResponseError: Invalid error response format spam.
 */

import { z } from "zod";
import { runAgent, AgentBudgetError, AgentProviderError } from "@/lib/ai/runtime";
import { enrichmentToolSet } from "@/lib/ai/tools";
import {
  resolveApplication,
  writeResolvedApplicationToCache,
  type EnrichmentPersonData,
  type ResolvedApplication,
  type ResolveParams,
} from "@/lib/enrichment";
import { isProviderConfigured } from "@/lib/ai/router";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Loose schema — every field is optional at parse time so a missing `sources`
 * or `confidence` doesn't crash the whole run. We normalise to a strict
 * `EnrichedApplication` immediately after parsing.
 */
const outputSchema = z.object({
  applicantName: z.string().nullable().optional(),
  applicantAddress: z.string().nullable().optional(),
  applicantEmail: z.string().nullable().optional(),
  applicantEmailSource: z.string().nullable().optional(),
  applicantEmailConfidence: z.number().int().min(0).max(100).nullable().optional(),
  applicantEmailStatus: z.string().nullable().optional(),
  agentName: z.string().nullable().optional(),
  agentAddress: z.string().nullable().optional(),
  agentEmail: z.string().nullable().optional(),
  agentEmailSource: z.string().nullable().optional(),
  agentEmailConfidence: z.number().int().min(0).max(100).nullable().optional(),
  agentEmailStatus: z.string().nullable().optional(),
  agentPhone: z.string().nullable().optional(),
  caseOfficer: z.string().nullable().optional(),
  ward: z.string().nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  sources: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export type EnrichedApplication = {
  applicantName: string | null;
  applicantAddress: string | null;
  applicantEmail: string | null;
  applicantEmailSource: string | null;
  applicantEmailConfidence: number | null;
  applicantEmailStatus: string | null;
  applicantPerson?: EnrichmentPersonData | null;
  agentName: string | null;
  agentAddress: string | null;
  agentEmail: string | null;
  agentEmailSource: string | null;
  agentEmailConfidence: number | null;
  agentEmailStatus: string | null;
  agentPerson?: EnrichmentPersonData | null;
  agentPhone: string | null;
  caseOfficer: string | null;
  ward: string | null;
  confidence: "low" | "medium" | "high";
  sources: string[];
  notes?: string;
};

function normaliseEnriched(
  raw: z.infer<typeof outputSchema>,
): EnrichedApplication {
  return {
    applicantName: raw.applicantName ?? null,
    applicantAddress: raw.applicantAddress ?? null,
    applicantEmail: raw.applicantEmail ?? null,
    applicantEmailSource: raw.applicantEmailSource ?? null,
    applicantEmailConfidence: raw.applicantEmailConfidence ?? null,
    applicantEmailStatus: raw.applicantEmailStatus ?? null,
    agentName: raw.agentName ?? null,
    agentAddress: raw.agentAddress ?? null,
    agentEmail: raw.agentEmail ?? null,
    agentEmailSource: raw.agentEmailSource ?? null,
    agentEmailConfidence: raw.agentEmailConfidence ?? null,
    agentEmailStatus: raw.agentEmailStatus ?? null,
    agentPhone: raw.agentPhone ?? null,
    caseOfficer: raw.caseOfficer ?? null,
    ward: raw.ward ?? null,
    confidence: raw.confidence ?? "low",
    sources: raw.sources ?? [],
    notes: raw.notes,
  };
}

export async function runEnrichmentAgent(args: {
  ctx: { companyId: string; userId?: string };
  reference: string;
  planningEntity: number;
  organisationEntity?: string | number | null;
  lpaWebsite?: string | null;
  siteAddress?: string | null;
  /** Already-known fields from the search row — saves the agent a round trip. */
  seedApplicant?: string | null;
  seedAgent?: string | null;
  seedAgentAddress?: string | null;
  /**
   * Result of the deterministic cascade (cache → PlanWire → LPA portal) that
   * ran BEFORE the agent was invoked. The agent uses this as its starting
   * point and only needs to fill remaining gaps via Companies House / web
   * search. Prevents the agent from wasting 8+ steps redoing work we've
   * already done in <2 seconds.
   */
  preResolved?: ResolvedApplication | null;
}): Promise<EnrichedApplication> {
  const system = `You are an enrichment agent for UK Plott. Your job is to
fill gaps left by our deterministic cascade (cache → PlanWire → LPA portal),
which has already run. You escalate to Companies House, Hunter, and the open
web when the deterministic result is missing a contact name, address, email,
or phone.

Tools at your disposal:
- readEnrichmentCache: Postgres cache lookup (rarely needed — the cascade already ran it).
- planwireLookup: canonical council-ref lookup (rarely needed — the cascade already ran it). May rate-limit → { rateLimited: true }.
- lpaPortalScrape: scrapes the LPA's own register. Only call this if the cascade didn't already try it.
- companiesHouseSearch: search UK registrar by company name. Use for ANY organisation name.
- companiesHouseProfile: get registered office address + SIC codes for a company number.
- companiesHouseOfficers: get current directors and secretaries for a company number. USE THIS to find a named person to address letters to when the applicant is a company.
- hunterDomainSearch: structured email discovery for an organisation domain or company name. Prefer this before webSearch when email is missing.
- hunterCompanyEnrichment: resolve a company domain (and firmographic name) when Domain Search did not return a domain. Use before Email Finder when you only have a company name.
- hunterEmailFinder: find a likely email for a named person at a company/domain.
- hunterEmailVerifier: verify an email candidate before storing it.
- webSearch: open-web fallback for missing contact details (email/phone), individual applicants, or finding a contact name at an organisation.
- writeEnrichmentCache: legacy cache writer. You may skip it; the application persists your final JSON after this run.

IMPORTANT: The deterministic cascade may have ALREADY resolved Companies House + Hunter before you run. If the PRE-RESOLVED block contains applicantName (with a director/officer), applicantAddress, and/or applicantEmail from companies_house/hunter, treat those as verified — do NOT claim tools are unavailable and do NOT redo those lookups unless a field is genuinely missing.

CRITICAL RULE for Companies House:
- If you have ANY applicant or agent name that could possibly be an organisation, you MUST call companiesHouseSearch.
- Examples that MUST be searched: "University of London", "ABC Properties", "John Smith Developments", "London Borough Council", "St Mary's Trust", "Green Energy Cooperative".
- Only skip Companies House if the name is clearly an individual person with no organisational indicators.

CRITICAL RULE for finding an addressee:
- When the applicant is a company/organisation, you MUST call companiesHouseOfficers after getting the company profile.
- Look for a "director" first. If no director, use "secretary".
- Set applicantName to the officer's name (e.g. "John Smith, Director") so letters can be addressed to a real person.
- Keep the company name in applicantAddress along with the registered office (e.g. "ABC Developments Ltd, 123 High Street...").

Fast cascade (run only what's needed, stop as soon as fields are full):
1. Look at the PRE-RESOLVED block below. Treat those values as given — do NOT re-fetch them.
2. If the pre-resolved record already has a contact name AND address, only use Hunter if email is missing, or webSearch if phone is missing. Otherwise emit immediately.
3. For every organisation-shaped name without an address: companiesHouseSearch → companiesHouseProfile → companiesHouseOfficers.
4. If you have a company/domain and no email: hunterDomainSearch. If Domain Search returns no domain, call hunterCompanyEnrichment with the company name to resolve one. If you have a named person plus company/domain: hunterEmailFinder. Verify non-Hunter email candidates with hunterEmailVerifier.
5. If you have a name + org address but no contact person: ONE webSearch for "{org} planning contact".
6. If you still lack email/phone: up to ONE webSearch.
7. Emit the merged result. Do not spend a final tool step solely to write cache.

HARD LIMITS:
- Maximum 2 webSearch calls total per run.
- Never call planwireLookup or lpaPortalScrape unless the pre-resolved block is empty.
- If a tool fails or rate-limits, move on — do NOT retry.

Output rules:
- Emit ONE JSON object matching the schema, even when every field is null.
- Never invent fields; null is better than a guess.
- Store Hunter emails for applicants in applicantEmail with applicantEmailSource="hunter", applicantEmailConfidence as Hunter score/confidence, and applicantEmailStatus as verifier/finder status.
- Store Hunter emails for planning agents in agentEmail with agentEmailSource="hunter", agentEmailConfidence as Hunter score/confidence, and agentEmailStatus as verifier/finder status. Include "hunter" in sources so the UI can show provenance.
- If Hunter returns an error or rate limit, move on without retrying; do not treat an API error as evidence that no email exists.
- Populate \`sources\` with every tool that actually contributed (include "cascade" for data from the pre-resolved block).
- confidence: "high" when you have both a name AND address from an authoritative source; "medium" when you have a name but no address; "low" otherwise.`;

  const seedLines: string[] = [];
  if (args.seedApplicant) seedLines.push(`  * Applicant/company: ${args.seedApplicant}`);
  if (args.seedAgent) seedLines.push(`  * Agent: ${args.seedAgent}`);
  if (args.seedAgentAddress)
    seedLines.push(`  * Agent address: ${args.seedAgentAddress}`);
  const seedBlock =
    seedLines.length > 0
      ? `- Seed values already known from the listing row:\n${seedLines.join("\n")}`
      : `- No seed values from the listing row.`;

  const pre = args.preResolved;
  const preLines: string[] = [];
  if (pre) {
    if (pre.companyName) preLines.push(`  * companyName: ${pre.companyName}`);
    if (pre.applicantName) preLines.push(`  * applicantName: ${pre.applicantName}`);
    if (pre.applicantAddress) preLines.push(`  * applicantAddress: ${pre.applicantAddress}`);
    if (pre.applicantEmail) preLines.push(`  * applicantEmail: ${pre.applicantEmail}`);
    if (pre.applicantEmailStatus)
      preLines.push(`  * applicantEmailStatus: ${pre.applicantEmailStatus}`);
    if (pre.agentName) preLines.push(`  * agentName: ${pre.agentName}`);
    if (pre.agentAddress) preLines.push(`  * agentAddress: ${pre.agentAddress}`);
    if (pre.agentEmail) preLines.push(`  * agentEmail: ${pre.agentEmail}`);
    if (pre.agentEmailStatus)
      preLines.push(`  * agentEmailStatus: ${pre.agentEmailStatus}`);
    if (pre.agentPhone) preLines.push(`  * agentPhone: ${pre.agentPhone}`);
    if (pre.caseOfficer) preLines.push(`  * caseOfficer: ${pre.caseOfficer}`);
    if (pre.ward) preLines.push(`  * ward: ${pre.ward}`);
    if (pre.sources?.length) preLines.push(`  * sources used: ${pre.sources.join(", ")}`);
  }
  const preBlock =
    preLines.length > 0
      ? `- PRE-RESOLVED (from deterministic cascade, treat as ground truth):\n${preLines.join("\n")}`
      : `- PRE-RESOLVED: empty — the deterministic cascade found nothing. You need to locate the applicant/agent from scratch.`;

  const prompt = `Application:
- Reference: ${args.reference}
- Planning entity id: ${args.planningEntity}
- Organisation entity id: ${args.organisationEntity ?? "unknown"}
- LPA website: ${args.lpaWebsite ?? "unknown"}
- Site address: ${args.siteAddress ?? "unknown"}
${seedBlock}
${preBlock}

Fill the gaps only. Do NOT redo work the cascade already did.

If the applicant name is an organisation:
1. companiesHouseSearch for the exact name
2. companiesHouseProfile for the registered address (if not already present)
3. companiesHouseOfficers to find a director or secretary to address letters to
4. Set applicantName = "{officer name}, Director" (or Secretary) and include company name in applicantAddress
5. Only use webSearch if no officers found AND you need a contact person

When done, output the consolidated JSON only.`;

  try {
    const res = await runAgent({
      kind: "enrichment_agent",
      ctx: args.ctx,
      system,
      prompt,
      tools: enrichmentToolSet(),
      outputSchema,
      // maxSteps/timeoutMs are driven by the enrichment_agent preset.
      traceName: `enrich ref=${args.reference}`,
    });
    const out = normaliseEnriched(res.data);
    return mergePreResolved(out, args.preResolved, args);
  } catch (err) {
    if (err instanceof AgentBudgetError || err instanceof AgentProviderError) {
      logger.warn(
        { reason: err.name, reference: args.reference },
        "enrichment agent unavailable — using deterministic pre-pass",
      );
    } else {
      // Gateway timeouts, schema mismatches, Zod errors etc. We've already
      // paid for the deterministic cascade upstream, so just surface that
      // rather than running the whole thing again.
      logger.warn(
        { err, reference: args.reference },
        "enrichment agent errored — using deterministic pre-pass",
      );
    }
    return preResolvedToEnriched(args.preResolved, args);
  }
}

/**
 * Promote whatever we got from the deterministic cascade into an
 * `EnrichedApplication` so the caller always gets something back, even when
 * the agent timed out / failed.
 */
function preResolvedToEnriched(
  pre: ResolvedApplication | null | undefined,
  args: {
    seedApplicant?: string | null;
    seedAgent?: string | null;
    seedAgentAddress?: string | null;
  },
): EnrichedApplication {
  if (!pre) {
    const hasSeed = Boolean(
      args.seedApplicant || args.seedAgent || args.seedAgentAddress,
    );
    return {
      applicantName: args.seedApplicant ?? null,
      applicantAddress: null,
      applicantEmail: null,
      applicantEmailSource: null,
      applicantEmailConfidence: null,
      applicantEmailStatus: null,
      applicantPerson: null,
      agentName: args.seedAgent ?? null,
      agentAddress: args.seedAgentAddress ?? null,
      agentEmail: null,
      agentEmailSource: null,
      agentEmailConfidence: null,
      agentEmailStatus: null,
      agentPerson: null,
      agentPhone: null,
      caseOfficer: null,
      ward: null,
      confidence: "low",
      sources: hasSeed ? ["row_seed"] : [],
      notes: "No enrichment available",
    };
  }
  return {
    applicantName: pre.applicantName ?? args.seedApplicant ?? null,
    applicantAddress: pre.applicantAddress ?? null,
    applicantEmail: pre.applicantEmail ?? null,
    applicantEmailSource: pre.applicantEmailSource ?? null,
    applicantEmailConfidence: pre.applicantEmailConfidence ?? null,
    applicantEmailStatus: pre.applicantEmailStatus ?? null,
    applicantPerson: pre.applicantPerson ?? null,
    agentName: pre.agentName ?? args.seedAgent ?? null,
    agentAddress: pre.agentAddress ?? args.seedAgentAddress ?? null,
    agentEmail: pre.agentEmail ?? null,
    agentEmailSource: pre.agentEmailSource ?? null,
    agentEmailConfidence: pre.agentEmailConfidence ?? null,
    agentEmailStatus: pre.agentEmailStatus ?? null,
    agentPerson: pre.agentPerson ?? null,
    agentPhone: pre.agentPhone ?? null,
    caseOfficer: pre.caseOfficer ?? null,
    ward: pre.ward ?? null,
    confidence: pre.confidence,
    sources: pre.sources ?? [pre.source],
  };
}

/**
 * If the agent returned partial data, overlay whatever we had from the
 * deterministic pre-pass so the final record never regresses.
 */
function mergePreResolved(
  agent: EnrichedApplication,
  pre: ResolvedApplication | null | undefined,
  args: {
    seedApplicant?: string | null;
    seedAgent?: string | null;
    seedAgentAddress?: string | null;
  },
): EnrichedApplication {
  const preSources = pre?.sources ?? (pre ? [pre.source] : []);
  const mergedSources = Array.from(
    new Set([...(agent.sources ?? []), ...preSources]),
  );
  return {
    applicantName: agent.applicantName ?? pre?.applicantName ?? args.seedApplicant ?? null,
    applicantAddress: agent.applicantAddress ?? pre?.applicantAddress ?? null,
    applicantEmail: agent.applicantEmail ?? pre?.applicantEmail ?? null,
    applicantEmailSource:
      agent.applicantEmailSource ?? pre?.applicantEmailSource ?? null,
    applicantEmailConfidence:
      agent.applicantEmailConfidence ?? pre?.applicantEmailConfidence ?? null,
    applicantEmailStatus:
      agent.applicantEmailStatus ?? pre?.applicantEmailStatus ?? null,
    applicantPerson: agent.applicantPerson ?? pre?.applicantPerson ?? null,
    agentName: agent.agentName ?? pre?.agentName ?? args.seedAgent ?? null,
    agentAddress:
      agent.agentAddress ?? pre?.agentAddress ?? args.seedAgentAddress ?? null,
    agentEmail: agent.agentEmail ?? pre?.agentEmail ?? null,
    agentEmailSource: agent.agentEmailSource ?? pre?.agentEmailSource ?? null,
    agentEmailConfidence:
      agent.agentEmailConfidence ?? pre?.agentEmailConfidence ?? null,
    agentEmailStatus: agent.agentEmailStatus ?? pre?.agentEmailStatus ?? null,
    agentPerson: agent.agentPerson ?? pre?.agentPerson ?? null,
    agentPhone: agent.agentPhone ?? pre?.agentPhone ?? null,
    caseOfficer: agent.caseOfficer ?? pre?.caseOfficer ?? null,
    ward: agent.ward ?? pre?.ward ?? null,
    confidence: agent.confidence ?? pre?.confidence ?? "low",
    sources: mergedSources,
    notes: agent.notes,
  };
}

/**
 * Returns true when the deterministic cascade produced enough data that the
 * LLM agent wouldn't meaningfully improve the record. Calling the agent
 * anyway wastes a 45s budget and often trips rate limits.
 */
function isDeterministicResultSufficient(r: ResolvedApplication | null): boolean {
  if (!r) return false;
  const hunterCanFillEmail = Boolean(process.env.HUNTER_API_KEY?.trim());
  if (hunterCanFillEmail && !r.agentEmail && !r.applicantEmail) return false;
  // High confidence from cache/planwire/lpa_portal → we already have a
  // contact name and enough address to send outreach.
  if (r.confidence === "high" && (r.agentName || r.applicantName)) return true;
  // Agent + agent address OR applicant + applicant address → we can
  // address outreach correctly, no need to chase Companies House.
  if (r.agentName && r.agentAddress) return true;
  if (r.applicantName && r.applicantAddress) return true;
  return false;
}

/**
 * Drop-in replacement for `resolveApplication`. Strategy:
 *   1. Run the deterministic cascade first (cache → PlanWire → LPA portal).
 *      This is fast (~500ms–3s) and hits the same data the agent would
 *      reach via `readEnrichmentCache` / `planwireLookup` / `lpaPortalScrape`
 *      but without paying for LLM tokens or a 45s model round-trip.
 *   2. If the cascade already produced a confident contact+address, return
 *      it — no LLM call, no risk of gateway timeouts.
 *   3. Otherwise, invoke the LLM agent to fill gaps (Companies House /
 *      web search), passing the cascade result as context so the agent
 *      only burns steps on the missing fields.
 *   4. If the agent fails (gateway timeout, budget error, etc.), fall back
 *      to whatever the cascade found — we never regress below step 1.
 */
export async function resolveApplicationWithAi(
  params: ResolveParams & {
    companyId?: string;
    userId?: string;
    seedApplicant?: string | null;
    seedAgent?: string | null;
    seedAgentAddress?: string | null;
  },
): Promise<ResolvedApplication | null> {
  const preResolved = await resolveApplication({
    reference: params.reference,
    planningEntity: params.planningEntity,
    organisationEntity: params.organisationEntity,
    councilId: params.councilId,
    lpaWebsite: params.lpaWebsite,
    siteAddress: params.siteAddress,
    seedApplicant: params.seedApplicant,
    seedAgent: params.seedAgent,
    forceRefresh: params.forceRefresh,
  }).catch((err) => {
    logger.warn(
      { err, reference: params.reference },
      "deterministic cascade threw — continuing with null pre-pass",
    );
    return null as ResolvedApplication | null;
  });

  const canUseAgent =
    Boolean(params.companyId) && isProviderConfigured("enrichment_agent");
  if (!canUseAgent) {
    return overlaySeeds(preResolved, params);
  }

  if (!params.forceRefresh && isDeterministicResultSufficient(preResolved)) {
    logger.debug(
      { reference: params.reference, confidence: preResolved!.confidence },
      "deterministic cascade sufficient — skipping LLM agent",
    );
    return overlaySeeds(preResolved, params);
  }

  const company = await prisma.company
    .findUnique({
      where: { id: params.companyId! },
      select: { aiEnabled: true },
    })
    .catch(() => null);
  if (!company?.aiEnabled) {
    return overlaySeeds(preResolved, params);
  }

  try {
    const enriched = await runEnrichmentAgent({
      ctx: { companyId: params.companyId!, userId: params.userId },
      reference: params.reference,
      planningEntity: params.planningEntity ?? 0,
      organisationEntity: params.organisationEntity ?? null,
      lpaWebsite: params.lpaWebsite ?? preResolved?.councilWebsite ?? null,
      siteAddress: params.siteAddress ?? null,
      seedApplicant: params.seedApplicant ?? null,
      seedAgent: params.seedAgent ?? null,
      seedAgentAddress: params.seedAgentAddress ?? null,
      preResolved,
    });
    const resolved: ResolvedApplication = {
      applicationRef: params.reference,
      planningEntity: params.planningEntity ?? null,
      organisationEntity: params.organisationEntity ?? null,
      siteAddress: params.siteAddress,
      applicantName: enriched.applicantName ?? params.seedApplicant ?? null,
      applicantAddress: enriched.applicantAddress ?? null,
      applicantEmail: enriched.applicantEmail,
      applicantEmailSource: enriched.applicantEmailSource,
      applicantEmailConfidence: enriched.applicantEmailConfidence,
      applicantEmailStatus: enriched.applicantEmailStatus,
      companyName: preResolved?.companyName ?? null,
      agentName: enriched.agentName ?? params.seedAgent ?? null,
      agentAddress: enriched.agentAddress ?? params.seedAgentAddress ?? null,
      agentEmail: enriched.agentEmail,
      agentEmailSource: enriched.agentEmailSource,
      agentEmailConfidence: enriched.agentEmailConfidence,
      agentEmailStatus: enriched.agentEmailStatus,
      agentPhone: enriched.agentPhone,
      caseOfficer: enriched.caseOfficer,
      ward: enriched.ward,
      url: preResolved?.url ?? null,
      councilWebsite: preResolved?.councilWebsite ?? null,
      source: "composite",
      confidence: enriched.confidence,
      sources: enriched.sources,
    };
    await writeResolvedApplicationToCache(resolved);
    return resolved;
  } catch (err) {
    logger.warn(
      { err, reference: params.reference },
      "agent failed — returning deterministic pre-pass",
    );
    return overlaySeeds(preResolved, params);
  }
}

/**
 * Overlay the caller's seed values on top of the deterministic cascade
 * result so the UI always has something to render, even when the cascade
 * returned null.
 */
function overlaySeeds(
  r: ResolvedApplication | null,
  params: ResolveParams & {
    seedApplicant?: string | null;
    seedAgent?: string | null;
    seedAgentAddress?: string | null;
  },
): ResolvedApplication | null {
  if (r) {
    return {
      ...r,
      applicantName: r.applicantName ?? params.seedApplicant ?? null,
      agentName: r.agentName ?? params.seedAgent ?? null,
      agentAddress: r.agentAddress ?? params.seedAgentAddress ?? null,
    };
  }
  if (params.seedApplicant || params.seedAgent || params.seedAgentAddress) {
    return {
      applicationRef: params.reference,
      planningEntity: params.planningEntity ?? null,
      organisationEntity: params.organisationEntity ?? null,
      siteAddress: params.siteAddress,
      applicantName: params.seedApplicant ?? null,
      agentName: params.seedAgent ?? null,
      agentAddress: params.seedAgentAddress ?? null,
      source: "composite",
      confidence: "low",
      sources: ["row_seed"],
    };
  }
  return null;
}
