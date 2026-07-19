/**
 * Outreach letter drafter. Claude Sonnet produces a UK-appropriate,
 * GDPR-conscious letter using tenant branding and the enrichment bundle.
 */

import { z } from "zod";
import { runAgent } from "@/lib/ai/runtime";
import { draftingToolSet } from "@/lib/ai/tools";
import { captureServerEvent } from "@/lib/posthog-server";
import type { EnrichedApplication } from "./enrichment-agent";
import type { OutreachContact } from "@/lib/outreach-contact";
import { normalizeLetterBodyHtml } from "@/lib/letter-body-shape";

export const outreachDraftAgentOutputSchema = z.object({
  subject: z.string().min(3).max(140),
  letterBodyHtml: z.string().min(40),
  emailSubject: z.string().min(3).max(140).optional(),
  emailBodyHtml: z.string().min(40).optional(),
});

export const outreachDraftOutputSchema = outreachDraftAgentOutputSchema.extend({
  recipient: z.object({
    name: z.string(),
    addressLines: z.string(),
  }),
  legalBasis: z.enum(["consent", "legitimate_interest"]),
});

export type OutreachDraft = z.infer<typeof outreachDraftOutputSchema> & {
  runId: string;
};

function finalizeOutreachDraft(
  agent: z.infer<typeof outreachDraftAgentOutputSchema>,
  recipientName: string,
  recipientAddress: string,
): z.infer<typeof outreachDraftOutputSchema> {
  return {
    ...agent,
    recipient: {
      name: recipientName,
      addressLines: recipientAddress || "Address not available",
    },
    legalBasis: "legitimate_interest",
  };
}

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
  ballpark?: {
    minGbp: number;
    maxGbp: number;
    weeks: number;
    include: boolean;
  } | null;
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
5. Do NOT invent £ prices or timelines. If a ballpark is provided in the prompt, you may briefly reference that the firm can discuss typical ranges — but do NOT write £ figures or legal disclaimer text yourself (the server injects those).
6. Return JSON only — keys: subject, letterBodyHtml, and when email is required also emailSubject and emailBodyHtml. Do NOT include recipient or legalBasis (added server-side).
7. Escape double quotes inside HTML strings so the JSON is valid.`;

  const emailBlock = draftEmail
    ? `\nA recipient email is available — you MUST include emailSubject and emailBodyHtml.`
    : `\nNo recipient email — omit emailSubject and emailBodyHtml.`;

  const ballparkBlock =
    args.ballpark?.include
      ? `\nAn approved indicative ballpark will be injected server-side (£${args.ballpark.minGbp}–£${args.ballpark.maxGbp}, ~${args.ballpark.weeks} weeks). Mention that you can share a rough sense of cost/time after they reply, without writing £ figures yourself.`
      : `\nNo ballpark will be included in this message.`;

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
${
  (() => {
    const person =
      args.contact.kind === "agent"
        ? args.enrichment?.agentPerson
        : args.enrichment?.applicantPerson ?? args.enrichment?.agentPerson;
    if (!person) return "";
    const bits = [
      person.position ? `title ${person.position}` : null,
      person.seniority ? `seniority ${person.seniority}` : null,
      person.employer ? `employer ${person.employer}` : null,
    ].filter(Boolean);
    return bits.length
      ? `\nRecipient role context (from Hunter Person Enrichment — reuse, do not invent): ${bits.join("; ")}.`
      : "";
  })()
}
${emailBlock}
${ballparkBlock}

Call the branding tool once, then draft. Output JSON only at the end.`;

  const res = await runAgent({
    kind: "outreach_drafter",
    ctx: args.ctx,
    system,
    prompt,
    tools: draftingToolSet(args.ctx.companyId),
    outputSchema: outreachDraftAgentOutputSchema,
    maxSteps: 4,
    traceName: `outreach-draft ref=${args.reference}`,
  });

  let draft = finalizeOutreachDraft(
    {
      ...res.data,
      letterBodyHtml: normalizeLetterBodyHtml(res.data.letterBodyHtml, {
        recipientAddressLines: recipientAddress,
        siteAddress: args.siteAddress,
      }),
    },
    recipientName,
    recipientAddress,
  );

  if (
    args.ballpark?.include &&
    args.ballpark.minGbp != null &&
    args.ballpark.maxGbp != null &&
    args.ballpark.weeks != null
  ) {
    const { injectBallparkIntoHtml } = await import(
      "@/lib/ai/agents/job-estimator"
    );
    const bp = {
      minGbp: args.ballpark.minGbp,
      maxGbp: args.ballpark.maxGbp,
      weeks: args.ballpark.weeks,
    };
    draft = {
      ...draft,
      letterBodyHtml: injectBallparkIntoHtml(draft.letterBodyHtml, bp),
      emailBodyHtml: draft.emailBodyHtml
        ? injectBallparkIntoHtml(draft.emailBodyHtml, bp)
        : draft.emailBodyHtml,
    };
  }

  if (
    args.ballpark &&
    args.ballpark.minGbp != null &&
    args.ballpark.maxGbp != null
  ) {
    await captureServerEvent({
      distinctId: args.ctx.userId ?? `company:${args.ctx.companyId}`,
      event: args.ballpark.include
        ? "ballpark_included_in_outreach"
        : "ballpark_omitted_from_outreach",
      properties: {
        company_id: args.ctx.companyId,
        min_gbp: args.ballpark.minGbp,
        max_gbp: args.ballpark.maxGbp,
        weeks: args.ballpark.weeks,
      },
    });
  }

  return {
    ...draft,
    runId: res.runId,
  };
}
