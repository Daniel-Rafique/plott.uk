/**
 * Agent runtime. Thin wrapper over the Vercel AI SDK that enforces our
 * guardrails (budget, PII redaction, persistence of `AgentRun`, tool-call
 * budget, timeout) so the rest of the app just calls `runAgent(...)` and gets
 * a typed result back.
 *
 * All four exported entry points share the same auditing behaviour:
 *
 *   - `runText`   — prose output (no schema)
 *   - `runObject` — typed output validated by a Zod schema
 *   - `runAgent`  — multi-step tool-using loop, optional structured output
 *   - `runStream` — streaming text for chat/letter-assist UIs
 */

import {
  generateText,
  generateObject,
  streamText,
  stepCountIs,
  type ToolSet,
  type ModelMessage,
  type TelemetrySettings,
} from "ai";
import type { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/observability";
import {
  getModel,
  getPreset,
  estimateCostGbp,
  isProviderConfigured,
  providerEnvKey,
  type AgentKind,
} from "@/lib/ai/router";
import {
  checkBudget,
  promptHash,
  redactForTrace,
} from "@/lib/ai/guardrails";
import {
  startTrace,
  endTrace,
  flushAllTraces,
  isLangfuseDisabledByEnv,
} from "@/lib/ai/trace";
import {
  getCompanyTier,
  getStripeMeta,
  isAgentKindAllowed,
  tierDefWithStripe,
  upgradeRequiredForKind,
  AgentTierError,
} from "@/lib/ai/tiers";
import { reportAiOverage } from "@/lib/ai/metering";
import { repairSubscriptionStateForEntitlements } from "@/lib/stripe/subscription-repair";

function getTelemetrySettings(
  kind: AgentKind,
  ctx: RunContext,
  traceName?: string
): TelemetrySettings {
  const metadata: Record<string, string> = {
    companyId: ctx.companyId,
    agentKind: kind,
  };
  if (ctx.userId) {
    metadata.userId = ctx.userId;
  }
  return {
    isEnabled: !isLangfuseDisabledByEnv(),
    functionId: traceName ?? kind,
    metadata,
  };
}

type RunContext = {
  companyId: string;
  userId?: string | null;
};

type RunCommon = {
  kind: AgentKind;
  ctx: RunContext;
  /** Override default tool-call budget. */
  maxSteps?: number;
  /** Override default timeout. */
  timeoutMs?: number;
  /** Optional human-readable name for Langfuse traces. */
  traceName?: string;
};

type RunPromptInput =
  | { system?: string; prompt: string; messages?: never }
  | { system?: string; prompt?: never; messages: ModelMessage[] };

export type AgentRunResult<T> = {
  data: T;
  runId: string;
  costGbp: number;
  tokens: { prompt: number; completion: number; total: number };
  toolCalls: number;
  durationMs: number;
};

export class AgentBudgetError extends Error {
  constructor(
    public readonly reason: "disabled" | "over_budget",
    public readonly budgetGbp: number,
    public readonly spentGbp: number,
  ) {
    super(
      reason === "disabled"
        ? "AI features are disabled for this workspace."
        : `Daily AI budget exceeded (£${spentGbp.toFixed(2)} / £${budgetGbp.toFixed(2)}).`,
    );
    this.name = "AgentBudgetError";
  }
}

export class AgentProviderError extends Error {
  constructor(kind: AgentKind) {
    super(
      `No API key configured for ${kind} (set ${providerEnvKey(kind)} in env).`,
    );
    this.name = "AgentProviderError";
  }
}

export { AgentTierError } from "@/lib/ai/tiers";

async function preflight(kind: AgentKind, ctx: RunContext): Promise<void> {
  if (!isProviderConfigured(kind)) throw new AgentProviderError(kind);
  let company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: {
      id: true,
      aiEnabled: true,
      aiDailyBudgetGbp: true,
      aiMonthlySpendGbp: true,
      aiSpendResetAt: true,
      subscriptionStatus: true,
      subscriptionPriceId: true,
    },
  });
  if (!company) throw new Error("Company not found for agent run");

  let tier = getCompanyTier(company);
  if (
    tier === "free" &&
    (company.subscriptionStatus === "active" ||
      company.subscriptionStatus === "trialing")
  ) {
    const repaired = await repairSubscriptionStateForEntitlements(company.id);
    if (repaired) {
      company = { ...company, ...repaired };
      tier = getCompanyTier(company);
    }
  }
  if (!isAgentKindAllowed(tier, kind)) {
    const required = upgradeRequiredForKind(kind);
    throw new AgentTierError(kind, tier, required ?? "pro");
  }

  // Monthly budget is no longer a hard block — overages are metered via Stripe.
  // Daily budget check remains as a runaway-cost safety net.
  const check = await checkBudget(company);
  if (!check.ok) {
    throw new AgentBudgetError(check.reason, check.budgetGbp, check.spentGbp);
  }
}

async function persistStart(
  kind: AgentKind,
  ctx: RunContext,
  input: unknown,
): Promise<{ runId: string; traceId: string }> {
  const preset = getPreset(kind);
  const runId = randomUUID();
  const traceId = randomUUID();
  await prisma.agentRun.create({
    data: {
      id: runId,
      companyId: ctx.companyId,
      userId: ctx.userId ?? null,
      kind,
      status: "running",
      model: `${preset.provider}:${preset.modelId}`,
      inputJson: redactForTrace(input) as object,
      traceId,
      promptHash: promptHash(input),
    },
  });
  return { runId, traceId };
}

type FinishStats = {
  promptTokens: number;
  completionTokens: number;
  toolCalls: number;
  durationMs: number;
};

async function persistFinish(
  runId: string,
  kind: AgentKind,
  output: unknown,
  stats: FinishStats,
  companyId: string,
): Promise<number> {
  const total = stats.promptTokens + stats.completionTokens;
  const costGbp = await estimateCostGbp(
    kind,
    stats.promptTokens,
    stats.completionTokens,
  );

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      aiMonthlySpendGbp: true,
      stripeCustomerId: true,
      subscriptionPriceId: true,
      subscriptionStatus: true,
    },
  });

  const prevSpend = Number(company?.aiMonthlySpendGbp ?? 0);

  await prisma.$transaction([
    prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "succeeded",
        outputJson: redactForTrace(output) as object,
        promptTokens: stats.promptTokens,
        completionTokens: stats.completionTokens,
        totalTokens: total,
        costGbp,
        toolCalls: stats.toolCalls,
        durationMs: stats.durationMs,
        completedAt: new Date(),
      },
    }),
    prisma.company.update({
      where: { id: companyId },
      data: { aiMonthlySpendGbp: { increment: costGbp } },
    }),
  ]);

  if (
    process.env.STRIPE_SECRET_KEY?.trim() &&
    company?.stripeCustomerId &&
    company.subscriptionPriceId
  ) {
    const tier = getCompanyTier(company);
    const resolvedTier = await tierDefWithStripe(tier, company.subscriptionPriceId);
    const includedBudget = resolvedTier.monthlyBudgetCapGbp;
    const newTotal = prevSpend + costGbp;

    if (includedBudget > 0 && newTotal > includedBudget) {
      const overageGbp = Math.min(costGbp, newTotal - includedBudget);
      const meta = await getStripeMeta(company.subscriptionPriceId);
      const overageRate = meta.aiOverageRate ?? 2;

      void reportAiOverage({
        companyId,
        stripeCustomerId: company.stripeCustomerId,
        overageGbp,
        overageRate,
      });
    }
  }

  return costGbp;
}

async function persistFailure(
  runId: string,
  err: unknown,
  stats: Partial<FinishStats> = {},
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await prisma.agentRun
    .update({
      where: { id: runId },
      data: {
        status: "failed",
        errorMessage: message.slice(0, 1000),
        durationMs: stats.durationMs ?? 0,
        toolCalls: stats.toolCalls ?? 0,
        completedAt: new Date(),
      },
    })
    .catch(() => {
      /* swallow — we already logged the real failure */
    });
}

export async function runText(
  args: RunCommon & RunPromptInput,
): Promise<AgentRunResult<string>> {
  const started = Date.now();
  await preflight(args.kind, args.ctx);
  const { runId, traceId } = await persistStart(args.kind, args.ctx, {
    system: args.system,
    prompt: args.prompt ?? args.messages,
  });
  const preset = getPreset(args.kind);
  startTrace({
    traceId,
    name: args.traceName ?? args.kind,
    companyId: args.ctx.companyId,
    userId: args.ctx.userId,
    kind: args.kind,
    input: redactForTrace({ system: args.system, prompt: args.prompt }),
  });
  try {
    const result = await generateText({
      model: getModel(args.kind),
      system: args.system,
      ...(args.messages
        ? { messages: args.messages }
        : { prompt: args.prompt ?? "" }),
      abortSignal: AbortSignal.timeout(args.timeoutMs ?? preset.timeoutMs ?? 30_000),
      experimental_telemetry: getTelemetrySettings(args.kind, args.ctx, args.traceName),
    });
    const stats: FinishStats = {
      promptTokens: result.usage.inputTokens ?? 0,
      completionTokens: result.usage.outputTokens ?? 0,
      toolCalls: 0,
      durationMs: Date.now() - started,
    };
    const costGbp = await persistFinish(
      runId,
      args.kind,
      { text: result.text },
      stats,
      args.ctx.companyId,
    );
    endTrace({ traceId, output: { text: result.text }, status: "ok" });
    await flushAllTraces();
    return {
      data: result.text,
      runId,
      costGbp,
      tokens: {
        prompt: stats.promptTokens,
        completion: stats.completionTokens,
        total: stats.promptTokens + stats.completionTokens,
      },
      toolCalls: 0,
      durationMs: stats.durationMs,
    };
  } catch (err) {
    logger.error({ err, kind: args.kind, runId }, "agent runText failed");
    captureError(err, { companyId: args.ctx.companyId, extra: { kind: args.kind } });
    await persistFailure(runId, err, { durationMs: Date.now() - started });
    endTrace({
      traceId,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    await flushAllTraces();
    throw err;
  }
}

export async function runObject<T>(
  args: RunCommon &
    RunPromptInput & {
      schema: z.ZodType<T>;
    },
): Promise<AgentRunResult<T>> {
  const started = Date.now();
  await preflight(args.kind, args.ctx);
  const { runId, traceId } = await persistStart(args.kind, args.ctx, {
    system: args.system,
    prompt: args.prompt ?? args.messages,
  });
  const preset = getPreset(args.kind);
  startTrace({
    traceId,
    name: args.traceName ?? `${args.kind}.object`,
    companyId: args.ctx.companyId,
    userId: args.ctx.userId,
    kind: args.kind,
    input: redactForTrace({ system: args.system, prompt: args.prompt }),
  });
  try {
    const result = await generateObject({
      model: getModel(args.kind),
      system: args.system,
      ...(args.messages
        ? { messages: args.messages }
        : { prompt: args.prompt ?? "" }),
      schema: args.schema,
      abortSignal: AbortSignal.timeout(args.timeoutMs ?? preset.timeoutMs ?? 30_000),
      experimental_telemetry: getTelemetrySettings(args.kind, args.ctx, args.traceName),
    });
    const stats: FinishStats = {
      promptTokens: result.usage.inputTokens ?? 0,
      completionTokens: result.usage.outputTokens ?? 0,
      toolCalls: 0,
      durationMs: Date.now() - started,
    };
    const costGbp = await persistFinish(
      runId,
      args.kind,
      result.object,
      stats,
      args.ctx.companyId,
    );
    endTrace({ traceId, output: redactForTrace(result.object), status: "ok" });
    await flushAllTraces();
    return {
      data: result.object as T,
      runId,
      costGbp,
      tokens: {
        prompt: stats.promptTokens,
        completion: stats.completionTokens,
        total: stats.promptTokens + stats.completionTokens,
      },
      toolCalls: 0,
      durationMs: stats.durationMs,
    };
  } catch (err) {
    logger.error({ err, kind: args.kind, runId }, "agent runObject failed");
    captureError(err, { companyId: args.ctx.companyId, extra: { kind: args.kind } });
    await persistFailure(runId, err, { durationMs: Date.now() - started });
    endTrace({
      traceId,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    await flushAllTraces();
    throw err;
  }
}

export async function runAgent<T = string>(
  args: RunCommon &
    RunPromptInput & {
      tools: ToolSet;
      /** When supplied, the model must return an object matching this schema. */
      outputSchema?: z.ZodType<T>;
    },
): Promise<AgentRunResult<T>> {
  const started = Date.now();
  await preflight(args.kind, args.ctx);
  const { runId, traceId } = await persistStart(args.kind, args.ctx, {
    system: args.system,
    prompt: args.prompt ?? args.messages,
  });
  const preset = getPreset(args.kind);
  startTrace({
    traceId,
    name: args.traceName ?? `${args.kind}.agent`,
    companyId: args.ctx.companyId,
    userId: args.ctx.userId,
    kind: args.kind,
    input: redactForTrace({ system: args.system, prompt: args.prompt }),
    metadata: { toolNames: Object.keys(args.tools) },
  });
  try {
    const result = await generateText({
      model: getModel(args.kind),
      system: args.system,
      ...(args.messages
        ? { messages: args.messages }
        : { prompt: args.prompt ?? "" }),
      tools: args.tools,
      stopWhen: stepCountIs(args.maxSteps ?? preset.maxSteps ?? 8),
      abortSignal: AbortSignal.timeout(args.timeoutMs ?? preset.timeoutMs ?? 60_000),
      experimental_telemetry: getTelemetrySettings(args.kind, args.ctx, args.traceName),
    });
    const toolCalls = result.steps.reduce(
      (acc, step) => acc + (step.toolCalls?.length ?? 0),
      0,
    );
    const usage = result.totalUsage ?? result.usage;
    const stats: FinishStats = {
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
      toolCalls,
      durationMs: Date.now() - started,
    };

    let output: unknown = { text: result.text };
    let data: T = result.text as unknown as T;
    if (args.outputSchema) {
      // Parse the model's final text as JSON and validate. This is more
      // reliable than the SDK's experimental_output for multi-step loops.
      const firstAttempt = tryParseWithSchema(result.text, args.outputSchema);
      if (firstAttempt.ok) {
        data = firstAttempt.data;
        output = data;
      } else {
        // One-shot repair: hand the failing output + schema issues back to the
        // same model and ask for a corrected JSON payload. This is the single
        // most common LLM failure mode (partial object, missing optional keys,
        // trailing prose) and a cheap round-trip fixes it far more often than
        // throwing a 500 at the user.
        logger.warn(
          { kind: args.kind, runId, issues: firstAttempt.issues },
          "agent output failed schema; attempting repair",
        );
        const repaired = await repairAgentJson({
          kind: args.kind,
          ctx: args.ctx,
          traceName: args.traceName,
          system: args.system,
          originalText: result.text,
          issues: firstAttempt.issues,
          schema: args.outputSchema,
        });
        if (repaired.ok) {
          data = repaired.data;
          output = data;
          stats.promptTokens += repaired.promptTokens;
          stats.completionTokens += repaired.completionTokens;
        } else {
          throw new Error(
            `Agent output did not match schema: ${firstAttempt.message}`,
          );
        }
      }
    }

    const costGbp = await persistFinish(
      runId,
      args.kind,
      output,
      stats,
      args.ctx.companyId,
    );
    endTrace({ traceId, output: redactForTrace(output), status: "ok" });
    await flushAllTraces();
    return {
      data,
      runId,
      costGbp,
      tokens: {
        prompt: stats.promptTokens,
        completion: stats.completionTokens,
        total: stats.promptTokens + stats.completionTokens,
      },
      toolCalls,
      durationMs: stats.durationMs,
    };
  } catch (err) {
    logger.error({ err, kind: args.kind, runId }, "agent runAgent failed");
    captureError(err, { companyId: args.ctx.companyId, extra: { kind: args.kind } });
    await persistFailure(runId, err, { durationMs: Date.now() - started });
    endTrace({
      traceId,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    await flushAllTraces();
    throw err;
  }
}

/**
 * Streaming variant for chat/letter-assist UIs. Returns the raw `streamText`
 * result; persistence happens in the `onFinish` callback so the caller can
 * pipe the stream directly back to the client.
 */
export function runStream(
  args: RunCommon &
    RunPromptInput & {
      tools?: ToolSet;
    },
) {
  const preset = getPreset(args.kind);
  const runId = randomUUID();
  const traceId = randomUUID();
  const started = Date.now();
  void preflight(args.kind, args.ctx).catch((e) => {
    logger.warn({ err: e, kind: args.kind }, "runStream preflight failed");
  });
  void prisma.agentRun
    .create({
      data: {
        id: runId,
        companyId: args.ctx.companyId,
        userId: args.ctx.userId ?? null,
        kind: args.kind,
        status: "running",
        model: `${preset.provider}:${preset.modelId}`,
        inputJson: redactForTrace({
          system: args.system,
          prompt: args.prompt,
        }) as object,
        traceId,
        promptHash: promptHash({ system: args.system, prompt: args.prompt }),
      },
    })
    .catch(() => {
      /* swallow */
    });
  startTrace({
    traceId,
    name: args.traceName ?? `${args.kind}.stream`,
    companyId: args.ctx.companyId,
    userId: args.ctx.userId,
    kind: args.kind,
    input: redactForTrace({ system: args.system, prompt: args.prompt }),
  });

  return streamText({
    model: getModel(args.kind),
    system: args.system,
    ...(args.messages
      ? { messages: args.messages }
      : { prompt: args.prompt ?? "" }),
    tools: args.tools,
    stopWhen: args.tools
      ? stepCountIs(args.maxSteps ?? preset.maxSteps ?? 4)
      : undefined,
    abortSignal: AbortSignal.timeout(args.timeoutMs ?? preset.timeoutMs ?? 60_000),
    experimental_telemetry: getTelemetrySettings(args.kind, args.ctx, args.traceName),
    onFinish: async ({ text, usage, steps }) => {
      const toolCalls = steps.reduce(
        (acc, step) => acc + (step.toolCalls?.length ?? 0),
        0,
      );
      await persistFinish(
        runId,
        args.kind,
        { text },
        {
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          toolCalls,
          durationMs: Date.now() - started,
        },
        args.ctx.companyId,
      ).catch(() => undefined);
      endTrace({ traceId, output: { text }, status: "ok" });
      await flushAllTraces();
    },
    onError: async ({ error }) => {
      await persistFailure(runId, error, { durationMs: Date.now() - started });
      endTrace({
        traceId,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      await flushAllTraces();
    },
  });
}

/**
 * Best-effort JSON extraction from a model response. Models occasionally wrap
 * their output in ```json fences or add prose; we strip both.
 */
function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fence) return fence[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    return text.slice(first, last + 1);
  }
  return text.trim();
}

type ParseOutcome<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      message: string;
      issues: Array<{ path: string; message: string }>;
    };

/**
 * Parse a raw model response against a schema without throwing. Returns either
 * the parsed data or a structured description of what went wrong, so callers
 * can either surface the error or retry.
 */
function tryParseWithSchema<T>(
  text: string,
  schema: z.ZodType<T>,
): ParseOutcome<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch (e) {
    return {
      ok: false,
      message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      issues: [{ path: "$", message: "response was not valid JSON" }],
    };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issues = parsed.error.issues.map((i) => ({
    path: i.path.join(".") || "$",
    message: i.message,
  }));
  return {
    ok: false,
    message: parsed.error.message,
    issues,
  };
}

/**
 * Single-shot repair pass. When the primary generation returns JSON that
 * doesn't match the schema, we re-prompt the same model with the failing
 * output plus a structured list of the zod issues and ask it to emit a
 * corrected object. No tools, short timeout — this is strictly cleanup.
 */
async function repairAgentJson<T>(args: {
  kind: AgentKind;
  ctx: RunContext;
  traceName?: string;
  system: string | undefined;
  originalText: string;
  issues: Array<{ path: string; message: string }>;
  schema: z.ZodType<T>;
}): Promise<
  | { ok: true; data: T; promptTokens: number; completionTokens: number }
  | { ok: false }
> {
  const issuesList = args.issues
    .map((i) => `- ${i.path}: ${i.message}`)
    .join("\n");
  const truncatedOriginal =
    args.originalText.length > 6000
      ? args.originalText.slice(0, 6000) + "\n…[truncated]"
      : args.originalText;
  const repairPrompt = `Your previous response failed schema validation with these issues:
${issuesList}

Previous response:
${truncatedOriginal}

Return the COMPLETE corrected JSON object. Rules:
- Output JSON only, no prose, no markdown code fences.
- Include every required key, even when the value is null or an empty array.
- Preserve values from the previous response where they are valid.
- Fix the listed issues.`;
  try {
    const repair = await generateText({
      model: getModel(args.kind),
      system: args.system,
      prompt: repairPrompt,
      abortSignal: AbortSignal.timeout(20_000),
      experimental_telemetry: getTelemetrySettings(
        args.kind,
        args.ctx,
        `${args.traceName ?? args.kind}:repair`,
      ),
    });
    const usage = repair.totalUsage ?? repair.usage;
    const attempt = tryParseWithSchema(repair.text, args.schema);
    if (!attempt.ok) {
      logger.warn(
        { kind: args.kind, issues: attempt.issues },
        "agent repair pass still failed schema",
      );
      return { ok: false };
    }
    return {
      ok: true,
      data: attempt.data,
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
    };
  } catch (err) {
    logger.warn({ err, kind: args.kind }, "agent repair pass threw");
    return { ok: false };
  }
}
