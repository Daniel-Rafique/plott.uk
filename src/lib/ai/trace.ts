/**
 * Langfuse tracing utilities.
 *
 * This module provides two integration paths:
 *
 * 1. **OpenTelemetry (preferred)**: When `experimental_telemetry` is enabled on
 *    AI SDK calls, spans are automatically captured via the LangfuseSpanProcessor
 *    set up in `src/instrumentation.ts`. Use `propagateAttributes()` to add
 *    session/user context and `forceFlushTraces()` to ensure delivery.
 *
 * 2. **Manual tracing (legacy)**: The `startTrace`/`endTrace` functions are kept
 *    for backward compatibility and for non-AI-SDK code paths that need tracing.
 *
 * Silent no-op when LANGFUSE_* env vars are unset, or when LANGFUSE_DISABLE
 * is set (e.g. CI evals with placeholder keys).
 *
 * @see https://langfuse.com/docs/integrations/vercel-ai-sdk
 */

import { Langfuse } from "langfuse";

let client: Langfuse | null = null;

/** When set, legacy Langfuse client and AI SDK telemetry stay off (e.g. CI evals). */
export function isLangfuseDisabledByEnv(): boolean {
  const dis = process.env.LANGFUSE_DISABLE?.trim().toLowerCase();
  return dis === "1" || dis === "true" || dis === "yes";
}

function isConfigured(): boolean {
  if (isLangfuseDisabledByEnv()) return false;
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY,
  );
}

function getClient(): Langfuse | null {
  if (!isConfigured()) return null;
  if (client) return client;
  client = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com",
  });
  return client;
}

type TraceEvent = {
  traceId: string;
  name: string;
  companyId: string;
  userId?: string | null;
  kind: string;
  input: unknown;
  metadata?: Record<string, unknown>;
};

type TraceUpdate = {
  traceId: string;
  output?: unknown;
  status?: "ok" | "error";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

export function startTrace(e: TraceEvent): void {
  const c = getClient();
  if (!c) return;
  try {
    c.trace({
      id: e.traceId,
      name: e.name,
      userId: e.userId ?? undefined,
      metadata: {
        companyId: e.companyId,
        kind: e.kind,
        ...e.metadata,
      },
      input: e.input,
    });
  } catch {
    /* swallow — traces must never break the caller */
  }
}

export function endTrace(u: TraceUpdate): void {
  const c = getClient();
  if (!c) return;
  try {
    c.trace({
      id: u.traceId,
      output: u.output,
      metadata: {
        status: u.status ?? "ok",
        errorMessage: u.errorMessage,
        ...u.metadata,
      },
    });
  } catch {
    /* swallow */
  }
}

/**
 * Best-effort flush for legacy manual traces.
 * Important for short-lived serverless functions.
 */
export async function flushTraces(): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.flushAsync();
  } catch {
    /* swallow */
  }
}

/**
 * Force flush OpenTelemetry spans via the LangfuseSpanProcessor.
 * Call this in serverless environments before the function terminates.
 *
 * This is separate from `flushTraces()` which flushes the legacy SDK client.
 * For complete coverage, call both if using both integration paths.
 */
export async function forceFlushOtelTraces(): Promise<void> {
  if (!isConfigured()) return;
  try {
    const { langfuseSpanProcessor } = await import("@/instrumentation");
    if (langfuseSpanProcessor) {
      await langfuseSpanProcessor.forceFlush();
    }
  } catch {
    /* swallow — instrumentation may not be available in all contexts */
  }
}

/**
 * Flush both legacy SDK traces and OpenTelemetry spans.
 * Use this as the single flush call for maximum coverage.
 */
export async function flushAllTraces(): Promise<void> {
  await Promise.all([flushTraces(), forceFlushOtelTraces()]);
}
