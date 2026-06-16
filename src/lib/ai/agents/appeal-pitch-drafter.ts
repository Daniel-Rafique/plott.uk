/**
 * Appeal pitch letter drafter. Claude Sonnet turns an
 * {@link classifyAppealViability} verdict into a professional outreach
 * letter aimed at the refused applicant / their agent, offering help with a
 * PINS appeal.
 *
 * Tone guidance:
 *   - Professional, not hard-sell — we're pitching appeal review as a service
 *     offered by a legal / planning consultancy, not telling the recipient
 *     they'll win.
 *   - Reference the specific refusal reason(s) to show we read the notice.
 *   - Mention the statutory deadline so urgency is clear.
 *   - Always include PECR opt-out line (legitimate interest basis).
 */

import { z } from "zod";
import { runAgent } from "@/lib/ai/runtime";
import { draftingToolSet } from "@/lib/ai/tools";
import type { OutreachContact } from "@/lib/outreach-contact";
import type { EnrichedApplication } from "./enrichment-agent";
import type {
  AppealClassification,
  AppealGround,
} from "./appeal-classifier";
import { APPEAL_GROUND_LABELS } from "./appeal-classifier";

const outputSchema = z.object({
  subject: z.string().min(3).max(140),
  bodyHtml: z.string().min(40),
  recipient: z.object({
    name: z.string(),
    addressLines: z.string(),
  }),
  /** Always legitimate_interest for unsolicited appeal pitches. */
  legalBasis: z.literal("legitimate_interest"),
});

export type AppealPitchDraft = z.infer<typeof outputSchema> & { runId: string };

function describeGrounds(grounds: AppealGround[]): string {
  if (grounds.length === 0) return "(no specific grounds identified)";
  return grounds.map((g) => APPEAL_GROUND_LABELS[g]).join("; ");
}

export async function draftAppealPitchLetter(args: {
  ctx: { companyId: string; userId?: string };
  contact: OutreachContact;
  enrichment: EnrichedApplication | null;
  /** Verdict from the appeal classifier — grounds, deadline, summary. */
  classification: AppealClassification;
  /** Human-friendly service label from ICP profile (e.g. "planning appeals"). */
  serviceType: string;
  siteAddress: string | null;
  description: string | null;
  reference: string;
  /** Raw refusal reason text pulled from the decision notice, if available. */
  refusalReason: string | null;
}): Promise<AppealPitchDraft> {
  const recipientName = args.contact.name || "Sir or Madam";
  const recipientAddress =
    args.contact.addressLines || args.siteAddress || "";
  const groundsDescription = describeGrounds(args.classification.grounds);

  const system = `You draft UK appeal-services pitch letters for a ${args.serviceType} firm.

The recipient's planning application has just been refused by the LPA. You are offering
to review the decision with a view to a PINS appeal (Planning Inspectorate).

Rules:
1. Call the branding tool once to get the sender's firm name, address, and phone.
2. Open with empathy — a refusal is a setback. Do NOT celebrate it.
3. Reference the specific reference number, site, and at least ONE concrete refusal reason
   so the recipient knows you read their decision notice.
4. State the identified grounds plainly (${groundsDescription}) but DO NOT promise
   a successful appeal.
5. Mention the statutory deadline explicitly. Be precise: "${args.classification.deadlineDate ?? "the statutory six-month deadline"}".
6. Offer a free 15-minute review call as the call-to-action, not a hard sale.
7. Close with a PECR opt-out line: "If you'd prefer not to receive correspondence from us,
   reply with 'remove' and we'll take you off our list."
8. Keep under 260 words. Polite, plain English, no legal jargon unless essential.
9. Return JSON matching the schema. bodyHtml must be valid semantic HTML (<p>, <strong>,
   <br/>); no <script>, <style>, or inline event handlers.`;

  const prompt = `Recipient: ${recipientName} (${args.contact.kind})
Recipient address:
${recipientAddress}

Refused application
- Reference: ${args.reference}
- Site: ${args.siteAddress ?? "(site address unknown)"}
- Description: ${args.description ?? "(no description)"}
- Decision date: ${args.classification.decisionDate ?? "(unknown)"}
- Appeal deadline: ${args.classification.deadlineDate ?? "(six months from refusal)"}
- Appeal type: ${args.classification.appealType}
- Refusal reason(s) extracted from notice: ${args.refusalReason ?? "(not yet extracted)"}

Classifier summary: ${args.classification.summary}

Call the branding tool once, then draft the pitch letter. Output JSON only at the end.`;

  const res = await runAgent({
    kind: "appeal_pitch_drafter",
    ctx: args.ctx,
    system,
    prompt,
    tools: draftingToolSet(args.ctx.companyId),
    outputSchema,
    maxSteps: 4,
    traceName: `appeal-pitch ref=${args.reference}`,
  });
  return { ...res.data, runId: res.runId };
}
