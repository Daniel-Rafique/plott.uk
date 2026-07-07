/**
 * Planning Q&A chat endpoint.
 *
 * POST { messages: [{ role, content }], application }
 *
 * Streams a Claude Sonnet response back as `text/plain`, with access to the
 * planning-Q&A tool set (planning entity lookup, LPA metadata, PlanWire
 * lookup, internal enrichment cache).
 *
 * Safety:
 *   - Rate-limited per company (aiChat).
 *   - Requires tenant context; no public access.
 *   - History is truncated to the last 20 messages and ~8k chars to keep
 *     prompts bounded and costs predictable.
 *   - System prompt instructs the model to cite sources and refuse to invent
 *     facts; fall-back to "I don't know" rather than hallucinate.
 */

import { z } from "zod";
import { NextResponse, after } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { runStream } from "@/lib/ai/runtime";
import { planningQaToolSet } from "@/lib/ai/tools";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isProviderConfigured, providerEnvKey } from "@/lib/ai/router";
import { requireAiEntitlement } from "@/lib/ai/entitlements";
import { forceFlushOtelTraces } from "@/lib/ai/trace";
import type { ModelMessage } from "ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HISTORY = 20;
const MAX_CHARS = 8_000;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4_000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  application: z
    .object({
      reference: z.string().max(500).optional(),
      planningEntity: z.number().int().positive().optional(),
      organisationEntity: z
        .union([z.string().max(60), z.number().int()])
        .optional(),
      siteAddress: z.string().max(400).optional(),
      description: z.string().max(1_000).optional(),
      status: z.string().max(500).optional(),
      applicationType: z.string().max(500).optional(),
      lpaName: z.string().max(200).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isProviderConfigured("planning_qa")) {
    return NextResponse.json(
      {
        error: `AI Q&A is not configured. Set ${providerEnvKey("planning_qa")}.`,
      },
      { status: 503 },
    );
  }

  const entitlement = await requireAiEntitlement(ctx, "planning_qa");
  if (!entitlement.ok) return entitlement.response;

  const rate = await checkRateLimit("aiChat", ctx.company.id);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterMs);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { messages, application } = parsed.data;

  const trimmed = trimHistory(messages);
  const modelMessages: ModelMessage[] = trimmed.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const appLines = application
    ? [
        application.reference ? `Reference: ${application.reference}` : null,
        application.planningEntity
          ? `Planning-entity ID: ${application.planningEntity}`
          : null,
        application.organisationEntity
          ? `Organisation-entity: ${application.organisationEntity}`
          : null,
        application.lpaName ? `LPA: ${application.lpaName}` : null,
        application.siteAddress ? `Site: ${application.siteAddress}` : null,
        application.applicationType
          ? `Type: ${application.applicationType}`
          : null,
        application.status ? `Status: ${application.status}` : null,
        application.description
          ? `Description: ${application.description}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "(no application supplied — general Q&A)";

  const system = `You are a senior UK planning-policy analyst and researcher embedded inside a lead-generation platform for construction professionals.

Your job is to help the user understand a specific planning application: what it is, what stage it is at, what the likely risks and dependencies are, and what the owner/applicant might need next.

You have access to tools that can fetch authoritative data:
  - planningEntity: public Planning Data API record for the application
  - planningOrganisation: metadata about the local planning authority
  - planwireSearch: search PlanWire by council, postcode, keyword, status, type, or date range
  - planwireLookup: look up a specific application by council reference (applicant / agent / case officer)
  - readEnrichmentCache: previously-fetched enrichment for this application

Rules:
1. Use the tools whenever the user asks for details you don't already know. Prefer planningEntity for status / dates / description; planwireSearch for area/keyword/postcode/status queries; planwireLookup for applicant / agent contact details on a specific reference.
2. NEVER invent facts. If a tool returns nothing, say so plainly.
3. Always caveat legal / policy advice — you are a research assistant, not a planning consultant.
4. Keep answers concise (4–8 short sentences or a short bulleted list). Use GitHub-flavoured Markdown (bold, italics, bullet lists, tables, links) for readability. Do NOT append a "Sources: …" trailer — the UI renders sources separately.
5. Do NOT reveal personal data (phone numbers, full home addresses of private individuals) even if a tool returns them; summarise instead. Company addresses and agent business addresses are fine to share.
6. If the user asks for an outreach letter or legal advice, refuse and suggest they open the Letter tools or consult a qualified planning consultant.

Application context:
${appLines}`;

  const result = runStream({
    kind: "planning_qa",
    ctx: { companyId: ctx.company.id, userId: ctx.user?.id ?? null },
    system,
    messages: modelMessages,
    tools: planningQaToolSet(),
    maxSteps: 6,
    traceName: "planning-qa.chat",
  });

  after(async () => {
    await forceFlushOtelTraces();
  });

  return result.toTextStreamResponse();
}

function trimHistory(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  const tail = messages.slice(-MAX_HISTORY);
  let used = 0;
  const out: typeof tail = [];
  for (let i = tail.length - 1; i >= 0; i--) {
    const msg = tail[i];
    if (used + msg.content.length > MAX_CHARS && out.length > 0) break;
    used += msg.content.length;
    out.unshift(msg);
  }
  return out;
}
