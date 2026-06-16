/**
 * Next.js instrumentation hook for OpenTelemetry + Langfuse tracing.
 *
 * This file is loaded once when the Next.js server starts (via the
 * `instrumentation` config in next.config.ts). It sets up a tracer provider
 * with the LangfuseSpanProcessor, which captures all AI SDK telemetry spans
 * and forwards them to Langfuse.
 *
 * The span processor is exported so route handlers can call `forceFlush()`
 * before serverless functions terminate.
 *
 * @see https://langfuse.com/docs/integrations/vercel-ai-sdk
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

export let langfuseSpanProcessor: LangfuseSpanProcessor | null = null;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const disabled =
      process.env.LANGFUSE_DISABLE?.trim().toLowerCase() === "1" ||
      process.env.LANGFUSE_DISABLE?.trim().toLowerCase() === "true" ||
      process.env.LANGFUSE_DISABLE?.trim().toLowerCase() === "yes";
    const hasLangfuseKeys =
      process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY;

    if (disabled || !hasLangfuseKeys) {
      console.log(
        `[instrumentation] Langfuse OpenTelemetry disabled (${disabled ? "LANGFUSE_DISABLE" : "missing keys"})`,
      );
      return;
    }

    langfuseSpanProcessor = new LangfuseSpanProcessor();

    const tracerProvider = new NodeTracerProvider({
      spanProcessors: [langfuseSpanProcessor],
    });

    tracerProvider.register();

    console.log("[instrumentation] Langfuse OpenTelemetry tracing enabled");
  }
}
