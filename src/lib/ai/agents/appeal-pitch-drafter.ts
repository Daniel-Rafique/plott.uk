/**
 * Appeal pitch letter drafter. Claude Sonnet turns an
 * {@link classifyAppealViability} verdict into a professional outreach
 * letter aimed at the refused applicant / their agent, offering help with a
 * PINS appeal.
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
  letterBodyHtml: z.string().min(40),
  emailSubject: z.string().min(3).max(140).optional(),
  emailBodyHtml: z.string().min(40).optional(),
  recipient: z.object({
    name: z.string(),
    addressLines: z.string(),
  }),
  legalBasis: z.literal("legitimate_interest"),
});

export type AppealPitchDraft = z.infer<typeof outputSchema> & { runId: string };

function describeGrounds(grounds: AppealGround[]): string {
  if (grounds.length === 0) return "(no specific grounds identified)";
  return grounds.map((g) => APPEAL_GROUND_LABELS[g]).join("; ");
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

export async function draftAppealPitchLetter(args: {
  ctx: { companyId: string; userId?: string };
  contact: OutreachContact;
  enrichment: EnrichedApplication | null;
  classification: AppealClassification;
  serviceType: string;
  siteAddress: string | null;
  description: string | null;
  reference: string;
  refusalReason: string | null;
}): Promise<AppealPitchDraft> {
  const recipientName = args.contact.name || "Sir or Madam";
  const recipientAddress =
    args.contact.addressLines || args.siteAddress || "";
  const groundsDescription = describeGrounds(args.classification.grounds);
  const draftEmail = hasRecipientEmail(args.contact, args.enrichment);

  const system = `You draft UK appeal-services outreach for a ${args.serviceType} firm.

The recipient's planning application has just been refused. Offer a PINS appeal review — professional, not hard-sell.

Produce TWO versions when a recipient email is available:
1. letterBodyHtml — body-only paragraphs (renderer adds letterhead, date, address, Re, salutation, signature).
2. emailBodyHtml + emailSubject — shorter inbox-friendly message mentioning the deadline and review call.

letterBodyHtml rules:
- No date, address block, Re line, "Dear…", sign-off, signature, or letterhead in the body.
- Reference refusal reason(s), grounds (${groundsDescription}), and deadline "${args.classification.deadlineDate ?? "statutory six-month deadline"}".
- Do NOT promise a successful appeal.
- PECR opt-out in final paragraph. Under 220 words.

Email rules (when required):
- Shorter (~130 words), mention deadline and free 15-minute review call CTA.
- emailSubject concise; no long "Re:" prefix.

General:
1. Call branding tool once.
2. Empathetic tone — refusal is a setback.
3. JSON only at the end. HTML: <p>, <strong>, <br/> only.`;

  const emailBlock = draftEmail
    ? `\nRecipient email available — include emailSubject and emailBodyHtml.`
    : `\nNo recipient email — omit emailSubject and emailBodyHtml.`;

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
- Refusal reason(s): ${args.refusalReason ?? "(not yet extracted)"}

Classifier summary: ${args.classification.summary}
${emailBlock}

Call the branding tool once, then draft. Output JSON only at the end.`;

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
