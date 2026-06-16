/**
 * Research briefing endpoint.
 *
 * GET  ?name=…&refresh=1 → cached briefing, runs the agent on cache miss.
 * POST { name, hint?, force? }    → same semantics as GET but with POST body.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { researchApplicant } from "@/lib/ai/agents/research-briefing";
import {
  AgentBudgetError,
  AgentProviderError,
  AgentTierError,
} from "@/lib/ai/runtime";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { requireAiEntitlement } from "@/lib/ai/entitlements";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const querySchema = z.object({
  name: z.string().min(2).max(200),
  hint: z.string().max(400).optional(),
  force: z.coerce.boolean().optional(),
});

async function handle(params: z.infer<typeof querySchema>, ctx: { company: { id: string }; user: { id: string } }) {
  try {
    const result = await researchApplicant({
      ctx: { companyId: ctx.company.id, userId: ctx.user.id },
      displayName: params.name,
      hint: params.hint,
      force: params.force,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AgentTierError) {
      return NextResponse.json(
        {
          error: err.message,
          upgradeTo: err.requiredTier,
          currentTier: err.currentTier,
        },
        { status: 402 },
      );
    }
    if (err instanceof AgentBudgetError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    if (err instanceof AgentProviderError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    logger.error({ err }, "research request failed");
    return NextResponse.json(
      { error: "Research briefing failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await requireAiEntitlement(ctx, "applicant_research");
  if (!entitlement.ok) return entitlement.response;

  const rate = await checkRateLimit("aiResearch", ctx.company.id);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterMs);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    name: url.searchParams.get("name"),
    hint: url.searchParams.get("hint") ?? undefined,
    force: url.searchParams.get("refresh") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  return handle(parsed.data, ctx);
}

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await requireAiEntitlement(ctx, "applicant_research");
  if (!entitlement.ok) return entitlement.response;

  const rate = await checkRateLimit("aiResearch", ctx.company.id);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterMs);

  const parsed = querySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  return handle(parsed.data, ctx);
}
