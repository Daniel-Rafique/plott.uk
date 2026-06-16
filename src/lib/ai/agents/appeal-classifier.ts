/**
 * Appeal viability classifier. Given a refused planning application, the
 * agent reads the refusal notice (via LPA portal scrape + web search fallback)
 * and returns a structured verdict on whether an appeal is worth pitching.
 *
 * Downstream the verdict is used by:
 *   - The outreach pipeline's branching logic (skip vs draft pitch letter)
 *   - The pitch-letter drafter (grounds list feeds merge fields)
 *
 * The classifier is deliberately conservative: borderline cases fall
 * through as `viable: false` so we don't pitch appeals on solid refusals
 * (e.g. application in designated Green Belt with no very special
 * circumstances) and embarrass our senders.
 */

import { z } from "zod";
import { runAgent } from "@/lib/ai/runtime";
import { appealsToolSet } from "@/lib/ai/tools";

const groundSchema = z.enum([
  "procedural_error",
  "policy_misinterpretation",
  "material_considerations_ignored",
  "changed_circumstances",
  "precedent_case",
  "condition_unreasonable",
  "other",
]);

const outputSchema = z.object({
  viable: z
    .boolean()
    .describe(
      "True only when the refusal has at least one plausible appeal ground and the six-month deadline has not lapsed.",
    ),
  appealType: z.enum(["written", "hearing", "inquiry"]).describe(
    "PINS appeal type: written representations for most small cases, hearing for mid-complexity, inquiry for major schemes / legal issues.",
  ),
  grounds: z
    .array(groundSchema)
    .max(4)
    .describe("Ordered by strength — strongest first."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Your confidence in the viability verdict (0 = low, 1 = high)."),
  summary: z
    .string()
    .min(10)
    .max(400)
    .describe(
      "Two-to-three sentence explanation the sender can drop into a pitch letter. Plain English, no legal jargon.",
    ),
  deadlineDate: z
    .string()
    .nullable()
    .describe(
      "ISO date (YYYY-MM-DD) of the appeal deadline (six months from decision date) or null if unknown.",
    ),
  decisionDate: z
    .string()
    .nullable()
    .describe("ISO date of the refusal decision, when known."),
});

export type AppealClassification = z.infer<typeof outputSchema>;
export type AppealGround = z.infer<typeof groundSchema>;

/** Human-readable labels for the compact ground enum. */
export const APPEAL_GROUND_LABELS: Record<AppealGround, string> = {
  procedural_error: "procedural error during determination",
  policy_misinterpretation: "policy misinterpretation by the LPA",
  material_considerations_ignored: "material considerations not weighed",
  changed_circumstances: "changed circumstances since decision",
  precedent_case: "favourable precedent in similar cases",
  condition_unreasonable: "unreasonable / unenforceable condition(s)",
  other: "other arguable ground",
};

export async function classifyAppealViability(args: {
  ctx: { companyId: string; userId?: string };
  refusal: {
    planningEntity: number;
    reference: string;
    siteAddress: string | null;
    description: string | null;
    /** Raw decision text (e.g. "Refused"). */
    decision?: string | null;
    /** YYYY-MM-DD decision date if we already have it. */
    decisionDate?: string | null;
    /** LPA portal website for the refusal-notice scraper. */
    councilWebsite?: string | null;
  };
}): Promise<AppealClassification> {
  const system = `You are an appeal-viability classifier for UK planning refusals.

Your job:
1. Read the decision notice. Call the lpaRefusalNoticeScrape tool once with the council website + reference to pull the numbered reasons for refusal. If it returns nothing useful, fall back to ONE webSearch for "<LPA> planning refusal <reference>".
2. Weigh the reasons against the common appeal grounds:
   - procedural_error: LPA missed statutory consultee, ignored validated plans, or determined under the wrong delegation.
   - policy_misinterpretation: cited policy that doesn't apply, or misread a material policy test.
   - material_considerations_ignored: benefits (e.g. affordable housing, regeneration) not weighted against harms.
   - changed_circumstances: since the decision, policy context or site context changed (e.g. neighbouring permission granted).
   - precedent_case: similar schemes granted nearby or on appeal that the LPA didn't address.
   - condition_unreasonable: decision technically "approved" but with unreasonable conditions that amount to de-facto refusal.
3. Estimate the appeal deadline — 6 months from the decision date for most refusals (12 weeks for householder).
4. Be conservative: if the only grounds are pure design judgement, policy-compliant refusals, or designated-land harm without very special circumstances, return viable: false.
5. Output JSON only — no prose around it.`;

  const prompt = `Refused application
- Reference: ${args.refusal.reference}
- Site: ${args.refusal.siteAddress ?? "(unknown)"}
- Description: ${args.refusal.description ?? "(no description)"}
- Decision text: ${args.refusal.decision ?? "Refused"}
- Decision date: ${args.refusal.decisionDate ?? "(unknown)"}
- Council website (for scraping): ${args.refusal.councilWebsite ?? "(unknown — skip scrape, use web search)"}

If you cannot find any specific refusal reason text after scraping AND one web search, return viable: false with confidence 0.3 and summary explaining the gap. Do not fabricate grounds.

Return JSON only.`;

  try {
    const res = await runAgent({
      kind: "appeal_classifier",
      ctx: args.ctx,
      system,
      prompt,
      tools: appealsToolSet(),
      outputSchema,
      maxSteps: 4,
      traceName: `appeal-classify ref=${args.refusal.reference}`,
    });
    return res.data;
  } catch {
    // Failing closed means "not viable" — never pitch appeals we can't justify.
    return {
      viable: false,
      appealType: "written",
      grounds: [],
      confidence: 0,
      summary:
        "Classifier unavailable — cannot verify appeal grounds, skipping pitch.",
      deadlineDate: null,
      decisionDate: args.refusal.decisionDate ?? null,
    };
  }
}
