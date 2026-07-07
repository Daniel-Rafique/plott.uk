/**
 * Applicant / agent research briefing agent.
 *
 * Produces a short dossier about a named applicant or agent before outreach.
 * Cached in `ApplicantResearch` for 30 days per tenant so we don't pay for
 * the same briefing twice (and so the same applicant across multiple apps
 * gets a consistent profile).
 *
 * Tools available:
 *   - Companies House (search, profile, officers)
 *   - Tavily web search (current information / website / recent news)
 *
 * Output is deliberately small — this is a briefing, not a biography.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runAgent, AgentBudgetError, AgentProviderError } from "@/lib/ai/runtime";
import { researchToolSet } from "@/lib/ai/tools";
import {
  isCompaniesHouseConfigured,
  searchCompanies,
  getCompanyProfile,
  getCompanyOfficers,
} from "@/lib/ai/tools/companies-house";
import { logger } from "@/lib/logger";

/**
 * Tolerant briefing schema.
 *
 * LLMs routinely drop nullable scalar fields ("companyNumber": null) and empty
 * arrays ("keyPeople": []) from their final JSON. Those omissions shouldn't
 * kill the whole response — every field has a safe default so partial output
 * still parses cleanly. Field quality is enforced through the prompt, not
 * through hard schema failures that surface as a 500 to the user.
 *
 * We use `.optional().default(...)` (rather than `.catch(...)` chains) because
 * TypeScript's inference for layered `.catch().default()` builders on union
 * types sometimes collapses to `unknown`. Plain optional+default keeps the
 * inferred output shape precise and still fills in missing keys.
 */
const nullableString = z
  .union([z.string(), z.null()])
  .default(null);

const stringArray = (maxItemLength: number) =>
  z.array(z.string().max(maxItemLength)).default([]);

const briefingSchema = z.object({
  summary: z.string().max(1200).default(""),
  entityType: z
    .enum(["individual", "company", "unknown"])
    .default("unknown"),
  companyNumber: nullableString,
  website: nullableString,
  keyPeople: stringArray(120),
  recentActivity: stringArray(300),
  riskFlags: stringArray(200),
  citations: stringArray(500),
  confidence: z.enum(["low", "medium", "high"]).default("low"),
});

export type ResearchBriefing = z.infer<typeof briefingSchema>;

export type ResearchResult = {
  briefing: ResearchBriefing;
  displayName: string;
  cached: boolean;
  fetchedAt: Date;
  expiresAt: Date;
};

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|llp|plc|l\.t\.d\.|inc)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

const COMPANY_SUFFIX_RE =
  /\b(ltd|limited|llp|plc|l\.?t\.?d\.?|c\.?i\.?c\.?|company|holdings|group|developments?|homes|properties|construction|builders?|associates|partnership)\b/i;

/** Heuristic: does this name look like a UK registered company? */
function looksLikeCompany(name: string): boolean {
  return COMPANY_SUFFIX_RE.test(name);
}

/**
 * Loose comparison to pick the best Companies House hit for a name. Strips the
 * usual corporate noise so "Star Plans Ltd" matches "STAR PLANS LTD".
 */
function scoreNameMatch(query: string, candidate: string): number {
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

type PreResolvedCompany = {
  block: string;
  companyNumber: string | null;
};

/**
 * Deterministic Companies House lookup performed BEFORE the LLM runs.
 *
 * The research model (Sonnet) is unreliable about actually invoking the
 * Companies House tool when the prompt pushes hard for JSON output — it tends
 * to shortcut to "no records found". For anything that looks like a registered
 * company we resolve the facts ourselves and hand them to the model so the
 * briefing is grounded in real data instead of a hallucinated blank.
 */
async function preresolveCompany(
  displayName: string,
): Promise<PreResolvedCompany | null> {
  if (!isCompaniesHouseConfigured() || !looksLikeCompany(displayName)) {
    return null;
  }
  try {
    const candidates = await searchCompanies(displayName, 5);
    if (candidates.length === 0) return null;

    const best = candidates
      .map((c) => ({ c, score: scoreNameMatch(displayName, c.name) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Prefer active companies on a tie.
        const aActive = a.c.status === "active" ? 1 : 0;
        const bActive = b.c.status === "active" ? 1 : 0;
        return bActive - aActive;
      })[0];

    if (!best || best.score === 0) {
      // No confident match — still surface candidates so the model can decide.
      const list = candidates
        .map(
          (c) =>
            `- ${c.name} (${c.number}, ${c.status}${
              c.incorporatedOn ? `, inc. ${c.incorporatedOn}` : ""
            })`,
        )
        .join("\n");
      return {
        companyNumber: null,
        block: `Companies House candidates for "${displayName}" (no exact match — verify before using):\n${list}`,
      };
    }

    const number = best.c.number;
    const [profile, officers] = await Promise.all([
      getCompanyProfile(number),
      getCompanyOfficers(number),
    ]);

    const lines: string[] = [
      `Verified via Companies House (UK gov register):`,
      `- Name: ${profile?.name ?? best.c.name}`,
      `- Company number: ${number}`,
      `- Status: ${profile?.status ?? best.c.status}`,
    ];
    if (profile?.incorporatedOn ?? best.c.incorporatedOn) {
      lines.push(
        `- Incorporated: ${profile?.incorporatedOn ?? best.c.incorporatedOn}`,
      );
    }
    if (profile?.registeredAddress) {
      lines.push(`- Registered office: ${profile.registeredAddress}`);
    }
    if (profile?.sicCodes?.length) {
      lines.push(`- SIC codes: ${profile.sicCodes.join(", ")}`);
    }
    if (profile?.lastAccountsPeriodEnd) {
      lines.push(`- Last accounts period end: ${profile.lastAccountsPeriodEnd}`);
    }
    if (officers.length) {
      lines.push(
        `- Officers: ${officers
          .map((o) => `${o.name} (${o.role})`)
          .join("; ")}`,
      );
    }

    return { companyNumber: number, block: lines.join("\n") };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), displayName },
      "companies_house_preresolve_failed",
    );
    return null;
  }
}

export async function researchApplicant(args: {
  ctx: { companyId: string; userId?: string };
  displayName: string;
  /** Optional hint e.g. "agent for application ABC/123" to focus the search. */
  hint?: string;
  /** Skip cache (used by the refresh button). */
  force?: boolean;
}): Promise<ResearchResult> {
  const normalisedName = normaliseName(args.displayName);
  if (!normalisedName) {
    throw new Error("Display name is required");
  }

  if (!args.force) {
    const cached = await prisma.applicantResearch.findUnique({
      where: {
        companyId_normalisedName: {
          companyId: args.ctx.companyId,
          normalisedName,
        },
      },
    });
    if (cached && cached.expiresAt > new Date()) {
      return {
        briefing: cached.briefingJson as unknown as ResearchBriefing,
        displayName: cached.displayName,
        cached: true,
        fetchedAt: cached.fetchedAt,
        expiresAt: cached.expiresAt,
      };
    }
  }

  const preResolved = await preresolveCompany(args.displayName);

  const system = `You research UK applicants or agents ahead of planning outreach. Produce a concise briefing.

You have live tools connected to real data sources (Companies House and web search). They ARE configured and working. NEVER claim you "lack access" to Companies House or the web — if you have not called a tool yet, call it. Only report "no records found" AFTER a tool returns empty.

Rules:
1. For anything that looks like a limited company (name contains Ltd/Limited/LLP/PLC/Group/Holdings etc.), you MUST use Companies House: call companiesHouseSearch, then fetch profile + officers for the best match. If a "Companies House data" block is provided below, treat it as already-verified fact and use it directly — do not contradict it or claim it is unavailable.
2. Use webSearch for individuals, for general context, or to confirm the company's current website and recent activity.
3. Keep "summary" under 200 words (minimum ~40 words). It should read like a 20-second briefing before sending outreach.
4. "riskFlags" lists only verifiable concerns (dissolved company, open insolvency, sanctions, public disputes). Do not invent.
5. "citations" must be real URLs you referenced. Empty array is acceptable.
6. "confidence" reflects how certain you are the research is about the right entity.
7. Output JSON only. No prose outside the JSON. Do not wrap in markdown fences.
8. You MUST include EVERY key listed in the template below, even when the value is null or an empty array. Do not omit keys.

Output template (all keys required, types must match):
{
  "summary": "string (40-1000 chars)",
  "entityType": "individual" | "company" | "unknown",
  "companyNumber": "string or null (8-char Companies House number when entityType is company)",
  "website": "string URL or null (official site, https preferred)",
  "keyPeople": ["string", ...] (directors, partners or other named decision-makers; [] if none),
  "recentActivity": ["string", ...] (recent news, projects, filings; [] if none),
  "riskFlags": ["string", ...] (only verifiable concerns; [] if none),
  "citations": ["https://...", ...] (URLs you referenced; [] if none),
  "confidence": "low" | "medium" | "high"
}`;

  const prompt = `Subject: ${args.displayName}
${args.hint ? `Context: ${args.hint}` : ""}
${
  preResolved
    ? `\nCompanies House data (already verified — use directly):\n${preResolved.block}\n`
    : ""
}
Research this subject. Prefer UK sources. Use web search to add current website / recent activity where useful. When finished, output a single JSON object matching the template above — include every key, using null or [] for unknown values.${
    preResolved?.companyNumber
      ? ` Set entityType to "company" and companyNumber to "${preResolved.companyNumber}".`
      : ""
  }`;

  try {
    const res = await runAgent<ResearchBriefing>({
      kind: "applicant_research",
      ctx: args.ctx,
      system,
      prompt,
      tools: researchToolSet(),
      outputSchema: briefingSchema as unknown as z.ZodType<ResearchBriefing>,
      maxSteps: 8,
      traceName: `research ${normalisedName}`,
    });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
    await prisma.applicantResearch.upsert({
      where: {
        companyId_normalisedName: {
          companyId: args.ctx.companyId,
          normalisedName,
        },
      },
      create: {
        companyId: args.ctx.companyId,
        normalisedName,
        displayName: args.displayName,
        briefingJson: res.data as unknown as object,
        confidence: res.data.confidence,
        fetchedAt: now,
        expiresAt,
      },
      update: {
        displayName: args.displayName,
        briefingJson: res.data as unknown as object,
        confidence: res.data.confidence,
        fetchedAt: now,
        expiresAt,
      },
    });
    return {
      briefing: res.data,
      displayName: args.displayName,
      cached: false,
      fetchedAt: now,
      expiresAt,
    };
  } catch (err) {
    if (err instanceof AgentBudgetError || err instanceof AgentProviderError) {
      throw err;
    }
    logger.error({ err, normalisedName }, "research agent failed");
    throw err;
  }
}
