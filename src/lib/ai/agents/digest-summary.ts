/**
 * Saved-search digest summariser. Claude Haiku reads the list of new
 * applications and produces a punchy 2-3 sentence intro plus a couple of
 * bullet highlights the user can glance at in their inbox.
 *
 * Degrades silently: callers should treat `null` as "no summary this week".
 */

import { z } from "zod";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import { runObject, AgentBudgetError, AgentProviderError } from "@/lib/ai/runtime";
import { logger } from "@/lib/logger";

const schema = z.object({
  intro: z.string().min(10).max(400),
  highlights: z.array(z.string().min(4).max(300)).max(5),
});

export type DigestSummary = z.infer<typeof schema>;

export async function summariseDigest(args: {
  ctx: { companyId: string; userId?: string };
  searchName: string;
  applications: PlanningApplicationEntity[];
}): Promise<DigestSummary | null> {
  if (!args.applications.length) return null;

  // Only send the signal-dense fields — keeps prompt short.
  const condensed = args.applications.slice(0, 20).map((a) => ({
    ref: a.reference,
    status: a["planning-application-status"] ?? null,
    decision: a["planning-decision-type"] ?? null,
    site: a["address-text"] ?? null,
    description: a.description ?? null,
    applicant: a.enrichment?.applicantName ?? null,
    agent: a.enrichment?.agentName ?? null,
  }));

  const system = `You summarise a weekly UK planning-lead digest for the recipient.

Rules:
1. "intro" = 2-3 sentences, max 400 characters, answering: what's new, what stands out, and is there anything unusual.
2. "highlights" = 0-5 tight bullets calling out individually notable records (e.g. a large scheme, a surprising refusal, clusters of activity). EACH highlight must be under 300 characters — be concise.
3. British English. No marketing speak. No emojis.
4. Do not invent information that isn't in the input.
5. If the applications are uniform/boring, say so plainly — short intro, few/no highlights.`;

  const prompt = `Saved search: ${args.searchName}
Total new records this digest: ${args.applications.length}

New applications (condensed JSON):
${JSON.stringify(condensed, null, 0)}

Output JSON only.`;

  try {
    const res = await runObject({
      kind: "digest_summary",
      ctx: args.ctx,
      system,
      prompt,
      schema,
      traceName: `digest-summary ${args.searchName}`,
    });
    return res.data;
  } catch (err) {
    if (err instanceof AgentBudgetError || err instanceof AgentProviderError) {
      logger.info({ reason: err.name }, "digest summary skipped");
    } else {
      logger.warn({ err }, "digest summariser failed");
    }
    return null;
  }
}
