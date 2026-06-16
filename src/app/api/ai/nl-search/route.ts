/**
 * Natural-language → structured filter parser for the dashboard search bar.
 *
 * Uses GPT-4.1 via `runObject` so we get a validated, typed filter object
 * back. The UI renders each extracted field as a removable chip.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { parseNlSearch } from "@/lib/ai/nl-search-parse";
import {
  AgentBudgetError,
  AgentProviderError,
  AgentTierError,
} from "@/lib/ai/runtime";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export type { NlFilterResult } from "@/lib/ai/nl-search-parse";
export {
  filterSchema,
  NL_SEARCH_SYSTEM_PROMPT,
  parseNlSearch,
} from "@/lib/ai/nl-search-parse";

const bodySchema = z.object({
  prompt: z.string().min(2).max(400),
});

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await checkRateLimit("aiNlSearch", ctx.company.id);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterMs);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const res = await parseNlSearch({
      prompt: parsed.data.prompt,
      companyId: ctx.company.id,
      userId: ctx.user?.id ?? null,
    });
    return NextResponse.json({
      filters: res.data,
      runId: res.runId,
      costGbp: res.costGbp,
    });
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
    logger.error({ err }, "nl-search failed");
    return NextResponse.json(
      { error: "Could not understand that query. Try rephrasing." },
      { status: 500 },
    );
  }
}
