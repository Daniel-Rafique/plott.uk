/**
 * Outreach letter drafter. Claude Sonnet produces a UK-appropriate,
 * GDPR-conscious letter using tenant branding and the enrichment bundle.
 */

import { z } from "zod";
import { runAgent } from "@/lib/ai/runtime";
import { draftingToolSet } from "@/lib/ai/tools";
import type { EnrichedApplication } from "./enrichment-agent";
import type { OutreachContact } from "@/lib/outreach-contact";

const outputSchema = z.object({
  subject: z.string().min(3).max(140),
  bodyHtml: z.string().min(40),
  recipient: z.object({
    name: z.string(),
    addressLines: z.string(),
  }),
  legalBasis: z.enum(["consent", "legitimate_interest"]),
});

export type OutreachDraft = z.infer<typeof outputSchema> & { runId: string };

export async function draftOutreachLetter(args: {
  ctx: { companyId: string; userId?: string };
  /** Resolved addressee from `resolveOutreachContact`. */
  contact: OutreachContact;
  /** Full enrichment bundle (passed through for the model's context). */
  enrichment: EnrichedApplication | null;
  siteAddress: string | null;
  description: string | null;
  reference: string;
  icpReason: string;
}): Promise<OutreachDraft> {
  const recipientName = args.contact.name || "Sir or Madam";
  const recipientAddress =
    args.contact.addressLines || args.siteAddress || "";

  const system = `You draft UK business-to-business outreach letters for a planning-led construction firm.

Rules:
1. Always call the branding tool to get the sender's company details.
2. Do NOT invent services the company doesn't advertise.
3. Keep the letter polite, specific, under 220 words.
4. Reference the specific site and application number to show you've done your research.
5. Include a clear "how to opt out" line at the end (PECR requirement).
6. Do NOT imply the recipient has any existing relationship with the company.
7. End by printing a JSON object matching the schema. No prose outside the JSON.
8. bodyHtml should be valid semantic HTML (<p>, <br/>, <strong>); no <script>, <style>, or inline event handlers.`;

  const prompt = `Recipient: ${recipientName} (${args.contact.kind})
Recipient address:
${recipientAddress}

Planning context:
- Reference: ${args.reference}
- Site: ${args.siteAddress ?? "(site address unknown)"}
- Description: ${args.description ?? "(no description)"}
${args.enrichment?.caseOfficer ? `- Case officer: ${args.enrichment.caseOfficer}` : ""}
${args.enrichment?.ward ? `- Ward: ${args.enrichment.ward}` : ""}

ICP match rationale: ${args.icpReason}

Call the branding tool once, then draft the letter. Output JSON only at the end.`;

  const res = await runAgent({
    kind: "outreach_drafter",
    ctx: args.ctx,
    system,
    prompt,
    tools: draftingToolSet(args.ctx.companyId),
    outputSchema,
    maxSteps: 4,
    traceName: `outreach-draft ref=${args.reference}`,
  });
  return { ...res.data, runId: res.runId };
}
