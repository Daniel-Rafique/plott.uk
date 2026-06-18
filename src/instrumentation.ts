/**
 * Next.js instrumentation hook for OpenTelemetry + Langfuse + PostHog tracing.
 *
 * This file is loaded once when the Next.js server starts (via the
 * `instrumentation` config in next.config.ts). It sets up a tracer provider
 * with span processors for:
 *   - LangfuseSpanProcessor: forwards AI SDK telemetry spans to Langfuse
 *   - PostHogSpanProcessor: converts gen_ai.* spans into $ai_generation events
 *     in PostHog AI Observability
 *
 * The Langfuse span processor is exported so route handlers can call
 * `forceFlush()` before serverless functions terminate.
 *
 * @see https://langfuse.com/docs/integrations/vercel-ai-sdk
 * @see https://posthog.com/docs/ai-engineering/observability
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
    const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

    const spanProcessors = [];

    if (!disabled && hasLangfuseKeys) {
      langfuseSpanProcessor = new LangfuseSpanProcessor();
      spanProcessors.push(langfuseSpanProcessor);
      console.log("[instrumentation] Langfuse OpenTelemetry tracing enabled");
    } else {
      console.log(
        `[instrumentation] Langfuse OpenTelemetry disabled (${disabled ? "LANGFUSE_DISABLE" : "missing keys"})`,
      );
    }

    if (posthogToken && posthogHost) {
      const { PostHogSpanProcessor } = await import("@posthog/ai/otel");
      spanProcessors.push(
        new PostHogSpanProcessor({ projectToken: posthogToken, host: posthogHost }),
      );
      console.log("[instrumentation] PostHog AI OpenTelemetry tracing enabled");
    }

    if (spanProcessors.length > 0) {
      const tracerProvider = new NodeTracerProvider({ spanProcessors });
      tracerProvider.register();
    }
  }
}
