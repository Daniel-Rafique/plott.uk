/**
 * Outreach letter drafter. Claude Sonnet produces a UK-appropriate,
 * GDPR-conscious letter using tenant branding and the enrichment bundle.
 */

import { z } from "zod";
import { runAgent } from "@/lib/ai/runtime";
import { draftingToolSet } from "@/lib/ai/tools";
import type { EnrichedApplication } from "./enrichment-agent";
import type { OutreachContact } from "@/lib/outreach-contact";

export const outreachDraftOutputSchema = z.object({
  subject: z.string().min(3).max(140),
  letterBodyHtml: z.string().min(40),
  emailSubject: z.string().min(3).max(140).optional(),
  emailBodyHtml: z.string().min(40).optional(),
  recipient: z.object({
    name: z.string(),
    addressLines: z.string(),
  }),
  legalBasis: z.enum(["consent", "legitimate_interest"]),
});

export type OutreachDraft = z.infer<typeof outreachDraftOutputSchema> & {
  runId: string;
};

function hasRecipientEmail(
  contact: OutreachContact,
  enrichment: EnrichedApplication | null,
): boolean {
  const candidates = [
    contact.email,
    enrichment?.agentEmail,
    enrichment?.applicantEmail,
  ];
  return candidates.some((e) => (e?.trim().length ?? 0) > 0);
}

export async function draftOutreachLetter(args: {
  ctx: { companyId: string; userId?: string };
  contact: OutreachContact;
  enrichment: EnrichedApplication | null;
  siteAddress: string | null;
  description: string | null;
  reference: string;
  icpReason: string;
}): Promise<OutreachDraft> {
  const recipientName = args.contact.name || "Sir or Madam";
  const recipientAddress =
    args.contact.addressLines || args.siteAddress || "";
  const draftEmail = hasRecipientEmail(args.contact, args.enrichment);

  const system = `You draft UK business-to-business outreach for a planning-led construction firm.

You produce TWO versions when a recipient email is available:
1. letterBodyHtml — body-only paragraphs for a printed letter (our renderer adds date, address, Re line, salutation, signature, and letterhead).
2. emailBodyHtml + emailSubject — a shorter email suitable for inbox reading.

Rules for letterBodyHtml:
- Do NOT include date, inside address, Re line, "Dear…", sign-off, signature, company letterhead, or postal address.
- Use 2–4 <p> paragraphs only; under 180 words.
- Include a clear opt-out line in the final paragraph (PECR).
- Valid semantic HTML (<p>, <strong>); no <script>, <style>, or inline event handlers.

Rules for email (when required):
- Shorter (~120 words), scannable, one clear CTA to reply or call.
- emailSubject should be concise and inbox-friendly (avoid long "Re:" boilerplate).
- emailBodyHtml may open with a brief greeting; no postal address block.
- Include opt-out guidance in the final paragraph.

General:
1. Always call the branding tool once for sender details.
2. Do NOT invent services the company doesn't advertise.
3. Reference the specific site and application number.
4. Do NOT imply an existing relationship with the recipient.
5. Return JSON matching the schema only — no prose outside JSON.`;

  const emailBlock = draftEmail
    ? `\nA recipient email is available — you MUST include emailSubject and emailBodyHtml.`
    : `\nNo recipient email — omit emailSubject and emailBodyHtml.`;

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
${emailBlock}

Call the branding tool once, then draft. Output JSON only at the end.`;

  const res = await runAgent({
    kind: "outreach_drafter",
    ctx: args.ctx,
    system,
    prompt,
    tools: draftingToolSet(args.ctx.companyId),
    outputSchema: outreachDraftOutputSchema,
    maxSteps: 4,
    traceName: `outreach-draft ref=${args.reference}`,
  });
  return { ...res.data, runId: res.runId };
}
