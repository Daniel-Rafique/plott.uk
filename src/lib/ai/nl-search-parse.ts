/**
 * NL → structured search filter. Used by `/api/ai/nl-search`, deep-search, and
 * eval scripts. Lives outside `app/api` so CLI evals never import Next routes or
 * Neon Auth (which requires cookie secrets at module load).
 */

import { z } from "zod";
import { runObject } from "@/lib/ai/runtime";

const STATUSES = [
  "approved",
  "granted",
  "refused",
  "withdrawn",
  "pending",
] as const;
const APPLICATION_TYPES = [
  "full",
  "outline",
  "reserved matters",
  "householder",
  "listed building",
  "prior approval",
] as const;
const DEVELOPMENT_TYPES = [
  "residential",
  "commercial",
  "change of use",
  "extension",
  "new build",
  "mixed use",
] as const;

// No `.default()` — AI Gateway structured output requires every property in `required`.
export const filterSchema = z.object({
  statuses: z.array(z.enum(STATUSES)).max(STATUSES.length),
  applicationTypes: z
    .array(z.enum(APPLICATION_TYPES))
    .max(APPLICATION_TYPES.length),
  developmentTypes: z
    .array(z.enum(DEVELOPMENT_TYPES))
    .max(DEVELOPMENT_TYPES.length),
  decisionFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  decisionTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  indexedSinceYear: z
    .number()
    .int()
    .gte(2000)
    .lte(2100)
    .nullable(),
  locationHint: z.string().max(120).nullable(),
  applicantLike: z.string().max(120).nullable(),
  keywords: z.array(z.string().max(60)).max(8),
  summary: z.string().min(2).max(160),
});

export type NlFilterResult = z.infer<typeof filterSchema>;

export const NL_SEARCH_SYSTEM_PROMPT = `You convert natural-language property/planning queries into a JSON filter for a UK Planning Data dashboard.

Allowed enum values (match verbatim):
- status: ${STATUSES.join(", ")}
- applicationType: ${APPLICATION_TYPES.join(", ")}
- developmentType: ${DEVELOPMENT_TYPES.join(", ")}

Rules:
1. Only use values from the allowed enums. Unknown concepts can go in "keywords".
2. "decisionFrom"/"decisionTo" are ISO YYYY-MM-DD dates; use null when no date is implied.
3. "indexedSinceYear" is a 4-digit year derived from phrases like "since 2022" or "last two years" (relative to today).
4. "locationHint" is a short free-text place name (neighbourhood, town, borough, postcode) we will geocode to a map viewport. Use null if no place is named.
5. "applicantLike" is a company or person name the user wants results filtered by (e.g. "Argent", "Berkeley Homes", "University of London"). Use null if not implied. Do NOT put place names here.
6. "summary" is a plain-English one-liner describing the filter, shown in the UI chip row.
7. Always include every key: use [] or null where a filter does not apply; vague prompts still get a helpful summary.
8. Ignore generic nouns as keywords: "applications", "application", "projects", "planning", "records", "cases". They add no thematic signal.
9. When the user names a work type that maps to an enum (e.g. "residential", "extension", "householder"), set the matching developmentTypes / applicationTypes AND also put the most specific work-type word in "keywords" (e.g. "residential extensions" → developmentTypes: ["residential","extension"], keywords: ["extension"]). That keyword drives full-text search upstream.
10. Do not invent a work type the user did not mention. Status + place alone is valid — leave keywords and developmentTypes empty.`;

/**
 * Shared parser used by the nl-search route, deep-search, and AI evals.
 */
export async function parseNlSearch(args: {
  prompt: string;
  companyId: string;
  userId?: string | null;
  /** Defaults to `nl-search.parse` (e.g. evals pass `eval.nl.<caseId>`). */
  traceName?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const userPrompt = `Today is ${today}. Parse this query into JSON:\n\n"${args.prompt}"`;
  return runObject({
    kind: "nl_search",
    ctx: { companyId: args.companyId, userId: args.userId ?? null },
    system: NL_SEARCH_SYSTEM_PROMPT,
    prompt: userPrompt,
    schema: filterSchema,
    traceName: args.traceName ?? "nl-search.parse",
  });
}
