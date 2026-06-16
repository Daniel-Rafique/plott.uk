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

  const system = `You research UK applicants or agents ahead of planning outreach. Produce a concise briefing.

Rules:
1. Use Companies House for limited companies (try companiesHouseSearch first; if a strong match, fetch profile + officers).
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

Research this subject. Prefer UK sources. When finished, output a single JSON object matching the template above — include every key, using null or [] for unknown values.`;

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
