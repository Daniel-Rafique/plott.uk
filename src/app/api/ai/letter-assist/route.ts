/**
 * Letter-assist streaming endpoint.
 *
 * POST { html, instruction, reference?, siteAddress? }
 * `html` must be body-only HTML — paragraphs between the salutation and the
 * sign-off. The API will reject documents containing any chrome (<!DOCTYPE>,
 * <html>, <head>, <body>, <style>, <img>) because the letterhead and
 * signature are composed server-side from Company + User records.
 *
 * Streams the rewritten body back as a `text/plain` stream so the client can
 * progressively show the edit.
 */

import { z } from "zod";
import { NextResponse, after } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { runStream } from "@/lib/ai/runtime";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  isProviderConfigured,
  providerEnvKey,
} from "@/lib/ai/router";
import { requireAiEntitlement } from "@/lib/ai/entitlements";
import { forceFlushOtelTraces } from "@/lib/ai/trace";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Reject any full-document scaffolding or image/style injection. */
const CHROME_PATTERN = /<(?:!doctype|html|head|body|style|img|script|iframe|link|meta|title)\b/i;

const bodyOnlyHtml = z
  .string()
  .min(20)
  .max(40_000)
  .refine((v) => !CHROME_PATTERN.test(v), {
    message:
      "html must be body-only (no <!DOCTYPE>, <html>, <head>, <body>, <style>, <img>, <script>, <iframe>, <link>, <meta>, <title>)",
  });

const bodySchema = z.object({
  html: bodyOnlyHtml,
  instruction: z.string().min(2).max(500),
  reference: z.string().max(500).optional(),
  siteAddress: z.string().max(300).optional(),
});

const PRESETS: Record<string, string> = {
  formal: "Make the tone more formal and professional.",
  concise: "Make it more concise — cut filler, keep key facts.",
  friendly: "Warm the tone slightly while keeping it professional.",
  plain_english: "Simplify — aim for GCSE-level plain English.",
  stronger_cta: "Strengthen the call-to-action at the end.",
};

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isProviderConfigured("letter_assist")) {
    return NextResponse.json(
      {
        error: `AI letter assist is not configured. Set ${providerEnvKey("letter_assist")}.`,
      },
      { status: 503 },
    );
  }

  const entitlement = await requireAiEntitlement(ctx, "letter_assist");
  if (!entitlement.ok) return entitlement.response;

  const rate = await checkRateLimit("aiLetterAssist", ctx.company.id);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterMs);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { html, instruction, reference, siteAddress } = parsed.data;
  const resolvedInstruction = PRESETS[instruction] ?? instruction;

  const system = `You rewrite the BODY of a UK planning outreach letter according to a user's instruction.

The input is a body-only HTML fragment — the paragraphs that appear between the salutation ("Dear X,") and the sign-off ("Yours sincerely,"). The letterhead, date, address block, "Re:" line, signature and footer are composed separately by the system and are NOT part of your input or output.

Output rules:
1. Return **HTML only** — no Markdown, no code fences, no commentary.
2. Output the body fragment ONLY. Do NOT emit <!DOCTYPE>, <html>, <head>, <body>, <style>, <img>, <script>, <iframe>, <link>, <meta>, or <title> — any of these will cause your output to be rejected.
3. Allowed tags: p, br, strong, em, ul, ol, li, h3, h4, a. No inline event handlers. No style attributes.
4. Do NOT invent facts (names, dates, prices, professional credentials).
5. Keep the body accurate to the original intent — you are editing, not replacing.
6. Keep it compliant: no guarantees of planning approval, no implied existing relationship, preserve any opt-out line if present.
7. Do NOT include a salutation ("Dear X,") or sign-off ("Yours sincerely,", signature) — those live outside the body.`;

  const prompt = `Application reference: ${reference ?? "(none)"}
Site: ${siteAddress ?? "(unknown)"}

User instruction:
${resolvedInstruction}

Original body (HTML fragment):
${html}

Output the revised body as an HTML fragment only.`;

  const result = runStream({
    kind: "letter_assist",
    ctx: { companyId: ctx.company.id, userId: ctx.user?.id ?? null },
    system,
    prompt,
    traceName: "letter-assist.rewrite",
  });

  after(async () => {
    await forceFlushOtelTraces();
  });

  return result.toTextStreamResponse();
}
