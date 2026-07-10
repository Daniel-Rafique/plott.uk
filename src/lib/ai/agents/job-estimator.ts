/**
 * AI-first job estimator. Claude Sonnet reads a planning application and the
 * company's rate card, then proposes an indicative £ range and timeline.
 * Disclaimer text is never invented here — the app injects a fixed string.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runObject } from "@/lib/ai/runtime";
import {
  BALLPARK_CONFIDENCE_THRESHOLD,
  BALLPARK_DISCLAIMER,
} from "@/lib/pipeline-shared";
import {
  applyBallparkTokens,
  ballparkParagraphHtml,
  injectBallparkIntoHtml,
  replaceBallparkInHtml,
  stripBallparkFromHtml,
} from "@/lib/ballpark-html";
import { captureServerEvent } from "@/lib/posthog-server";

export {
  applyBallparkTokens,
  ballparkParagraphHtml,
  injectBallparkIntoHtml,
  replaceBallparkInHtml,
  stripBallparkFromHtml,
};

const packageSchema = z.object({
  label: z.string(),
  assumption: z.string(),
  contributionGbp: z.number().optional(),
});

const estimatorRawSchema = z.object({
  workType: z.string(),
  scopeSummary: z.string(),
  packages: z.array(packageSchema),
  inferredAreaSqm: z.union([z.number(), z.null()]).optional(),
  complexity: z.enum(["low", "medium", "high"]),
  estimateMinGbp: z.number(),
  estimateMaxGbp: z.number(),
  estimateWeeksMin: z.number(),
  estimateWeeksMax: z.number(),
  confidence: z.number(),
  rationale: z.string(),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
  rateCardUsed: z.boolean(),
});

export type JobEstimate = {
  workType: string;
  scopeSummary: string;
  packages: Array<{
    label: string;
    assumption: string;
    contributionGbp?: number;
  }>;
  inferredAreaSqm: number | null;
  complexity: "low" | "medium" | "high";
  estimateMinGbp: number;
  estimateMaxGbp: number;
  estimateWeeksMin: number;
  estimateWeeksMax: number;
  /** Midpoint weeks for outreach copy / PipelineLead.estimateWeeks */
  estimateWeeks: number;
  confidence: number;
  rationale: string;
  risks: string[];
  assumptions: string[];
  rateCardUsed: boolean;
  runId: string;
};

export type RateCardSnapshot = {
  dayRateGbp: number | null;
  crewSizeDefault: number | null;
  unitRates: Record<string, number>;
  typicalWeeks: Record<string, number>;
  contingencyPercent: number;
  vatInclusive: boolean;
};

function asNumberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}

export async function loadRateCardSnapshot(
  companyId: string,
): Promise<RateCardSnapshot | null> {
  const row = await prisma.companyRateCard.findUnique({
    where: { companyId },
  });
  if (!row) return null;
  return {
    dayRateGbp: row.dayRateGbp,
    crewSizeDefault: row.crewSizeDefault,
    unitRates: asNumberMap(row.unitRatesJson),
    typicalWeeks: asNumberMap(row.typicalWeeksJson),
    contingencyPercent: row.contingencyPercent,
    vatInclusive: row.vatInclusive,
  };
}

function roundGbp(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n < 1000) return Math.round(n / 50) * 50;
  if (n < 20_000) return Math.round(n / 100) * 100;
  return Math.round(n / 500) * 500;
}

function postProcess(
  raw: z.infer<typeof estimatorRawSchema>,
  rateCard: RateCardSnapshot | null,
): Omit<JobEstimate, "runId"> {
  let min = Math.min(raw.estimateMinGbp, raw.estimateMaxGbp);
  let max = Math.max(raw.estimateMinGbp, raw.estimateMaxGbp);
  if (rateCard && rateCard.contingencyPercent > 0) {
    const factor = 1 + rateCard.contingencyPercent / 100;
    // Only widen max slightly if agent didn't already bake contingency in
    max = Math.max(max, min * factor * 0.95);
  }
  min = roundGbp(min);
  max = roundGbp(Math.max(max, min));
  const weeksMin = Math.max(0.5, Number(raw.estimateWeeksMin) || 1);
  const weeksMax = Math.max(weeksMin, Number(raw.estimateWeeksMax) || weeksMin);
  const estimateWeeks = Math.round(((weeksMin + weeksMax) / 2) * 10) / 10;
  let confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
  if (!rateCard) confidence = Math.min(confidence, 0.45);

  return {
    workType: raw.workType.trim() || "general_works",
    scopeSummary: raw.scopeSummary.trim() || "Indicative scope from planning description.",
    packages: (raw.packages ?? []).slice(0, 12).map((p) => ({
      label: p.label,
      assumption: p.assumption,
      contributionGbp:
        p.contributionGbp != null ? roundGbp(p.contributionGbp) : undefined,
    })),
    inferredAreaSqm:
      raw.inferredAreaSqm == null || !Number.isFinite(raw.inferredAreaSqm)
        ? null
        : Math.round(Number(raw.inferredAreaSqm)),
    complexity: raw.complexity,
    estimateMinGbp: min,
    estimateMaxGbp: max,
    estimateWeeksMin: weeksMin,
    estimateWeeksMax: weeksMax,
    estimateWeeks,
    confidence,
    rationale: raw.rationale.trim().slice(0, 800),
    risks: (raw.risks ?? []).slice(0, 8).map((r) => r.slice(0, 200)),
    assumptions: (raw.assumptions ?? []).slice(0, 12).map((a) => a.slice(0, 240)),
    rateCardUsed: Boolean(raw.rateCardUsed && rateCard),
  };
}

export async function estimateJob(args: {
  ctx: { companyId: string; userId?: string };
  candidate: {
    planningEntity: number;
    reference: string;
    siteAddress: string | null;
    description: string | null;
    status?: string | null;
    applicationType?: string | null;
  };
  overrides?: {
    areaSqm?: number;
    storeys?: number;
    complexity?: "low" | "medium" | "high";
  };
}): Promise<JobEstimate> {
  const [rateCard, icp] = await Promise.all([
    loadRateCardSnapshot(args.ctx.companyId),
    prisma.icpProfile.findUnique({ where: { companyId: args.ctx.companyId } }),
  ]);

  const rateCardBlock = rateCard
    ? `Company rate card (YOU MUST ground £ figures in these rates when applicable):
- Day rate: ${rateCard.dayRateGbp != null ? `£${rateCard.dayRateGbp}` : "(not set)"}
- Default crew size: ${rateCard.crewSizeDefault ?? "(not set)"}
- Unit rates (£): ${JSON.stringify(rateCard.unitRates)}
- Typical weeks by work type: ${JSON.stringify(rateCard.typicalWeeks)}
- Contingency: ${rateCard.contingencyPercent}%
- VAT inclusive flag: ${rateCard.vatInclusive}
Set rateCardUsed=true.`
    : `No company rate card is configured. Use conservative UK-typical ranges and widen the min/max spread. Set rateCardUsed=false and keep confidence ≤ 0.45.`;

  const system = `You are a UK construction job estimator for planning-led outreach.

Return JSON only matching the schema.

Rules:
- Propose an INDICATIVE ballpark, never a fixed quote.
- Prefer company rate-card unit rates and day rates over generic averages when a rate card is present.
- Infer work type (e.g. loft_conversion, rear_extension, re_roof, new_build, general_works) from the planning description.
- Infer likely floor area (m²) when not provided; state that in assumptions.
- Widen the £ range when the description is thin or ambiguous.
- estimateWeeksMin/Max are calendar weeks on site / programme, not labour-days alone.
- Do NOT invent legal disclaimer text.
- Do NOT claim the price is confirmed or binding.
- confidence is 0–1 for how reliable this ballpark is given the inputs.`;

  const overrideLines = [
    args.overrides?.areaSqm != null
      ? `User-provided area: ${args.overrides.areaSqm} m²`
      : null,
    args.overrides?.storeys != null
      ? `User-provided storeys: ${args.overrides.storeys}`
      : null,
    args.overrides?.complexity
      ? `User-provided complexity: ${args.overrides.complexity}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Planning application:
- Reference: ${args.candidate.reference}
- Site: ${args.candidate.siteAddress ?? "unknown"}
- Type: ${args.candidate.applicationType ?? "unknown"}
- Status: ${args.candidate.status ?? "unknown"}
- Description: ${args.candidate.description ?? "unknown"}

Company ICP / trade hints:
${icp?.description ?? "(none)"}
Keywords: ${(icp?.keywords ?? []).join(", ") || "(none)"}

${rateCardBlock}
${overrideLines ? `\nOverrides:\n${overrideLines}` : ""}

Produce the estimate JSON.`;

  const result = await runObject({
    kind: "job_estimator",
    ctx: args.ctx,
    system,
    prompt,
    schema: estimatorRawSchema,
    traceName: `job-estimate ref=${args.candidate.reference}`,
  });

  const processed = postProcess(result.data, rateCard);
  return { ...processed, runId: result.runId };
}

export function shouldIncludeBallparkInOutreach(args: {
  includeFlag: boolean;
  confidence: number | null | undefined;
  force?: boolean;
}): boolean {
  if (!args.includeFlag) return false;
  if (args.force) return true;
  return (args.confidence ?? 0) >= BALLPARK_CONFIDENCE_THRESHOLD;
}

export async function persistEstimateOnLead(args: {
  leadId: string;
  estimate: JobEstimate;
  distinctId?: string;
  regenerated?: boolean;
}) {
  const existing = await prisma.pipelineLead.findUnique({
    where: { id: args.leadId },
    select: { estimatedAt: true, includeBallparkInOutreach: true },
  });

  const estimateJson = {
    workType: args.estimate.workType,
    scopeSummary: args.estimate.scopeSummary,
    packages: args.estimate.packages,
    inferredAreaSqm: args.estimate.inferredAreaSqm,
    complexity: args.estimate.complexity,
    estimateWeeksMin: args.estimate.estimateWeeksMin,
    estimateWeeksMax: args.estimate.estimateWeeksMax,
    confidence: args.estimate.confidence,
    rationale: args.estimate.rationale,
    risks: args.estimate.risks,
    assumptions: args.estimate.assumptions,
    rateCardUsed: args.estimate.rateCardUsed,
    runId: args.estimate.runId,
  };

  const include =
    existing?.estimatedAt != null
      ? existing.includeBallparkInOutreach
      : args.estimate.confidence >= BALLPARK_CONFIDENCE_THRESHOLD;

  const updated = await prisma.pipelineLead.update({
    where: { id: args.leadId },
    data: {
      estimateMinGbp: args.estimate.estimateMinGbp,
      estimateMaxGbp: args.estimate.estimateMaxGbp,
      estimateWeeks: args.estimate.estimateWeeks,
      estimateJson,
      estimatedAt: new Date(),
      includeBallparkInOutreach: include,
    },
  });

  if (args.distinctId) {
    await captureServerEvent({
      distinctId: args.distinctId,
      event: args.regenerated ? "estimate_regenerated" : "estimate_created",
      properties: {
        lead_id: args.leadId,
        confidence: args.estimate.confidence,
        estimate_confidence: args.estimate.confidence,
        min_gbp: args.estimate.estimateMinGbp,
        max_gbp: args.estimate.estimateMaxGbp,
        weeks: args.estimate.estimateWeeks,
        rate_card_used: args.estimate.rateCardUsed,
      },
    });
  }

  return updated;
}

export async function ensureLeadAndEstimate(args: {
  companyId: string;
  userId?: string;
  planningEntity: number;
  applicationRef?: string | null;
  siteAddress?: string | null;
  description?: string | null;
  status?: string | null;
  applicationType?: string | null;
  force?: boolean;
}) {
  const { upsertPipelineLead } = await import("@/lib/pipeline");
  const lead = await upsertPipelineLead({
    companyId: args.companyId,
    planningEntity: args.planningEntity,
    applicationRef: args.applicationRef,
    siteAddress: args.siteAddress,
    description: args.description,
    stage: "new",
  });
  if (!args.force && lead.estimatedAt && lead.estimateMinGbp != null) {
    return lead;
  }
  const estimate = await estimateJob({
    ctx: { companyId: args.companyId, userId: args.userId },
    candidate: {
      planningEntity: args.planningEntity,
      reference: args.applicationRef ?? String(args.planningEntity),
      siteAddress: args.siteAddress ?? null,
      description: args.description ?? null,
      status: args.status,
      applicationType: args.applicationType,
    },
  });
  return persistEstimateOnLead({
    leadId: lead.id,
    estimate,
    distinctId: args.userId,
    regenerated: !!lead.estimatedAt,
  });
}

export { BALLPARK_DISCLAIMER, BALLPARK_CONFIDENCE_THRESHOLD };
