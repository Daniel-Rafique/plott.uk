/**
 * Lightweight facade over Sentry + PostHog. Sentry is initialized via
 * `src/instrumentation.ts` (server/edge) and `src/instrumentation-client.ts`
 * (browser); `captureException` is a no-op when no DSN is configured, so this
 * stays safe to call everywhere.
 */

import * as Sentry from "@sentry/nextjs";

type Props = Record<string, string | number | boolean | null | undefined>;

export function captureError(
  err: unknown,
  context?: { userId?: string; companyId?: string; extra?: Props },
): void {
  const error = err instanceof Error ? err : new Error(String(err));
  if (process.env.NODE_ENV !== "production") {
    console.error("[error]", error.message, context);
  }
  Sentry.captureException(error, {
    user: context?.userId ? { id: context.userId } : undefined,
    tags: context?.companyId ? { companyId: context.companyId } : undefined,
    extra: context?.extra,
  });
}

export function trackEvent(
  name: string,
  props?: Props & { userId?: string; companyId?: string },
): void {
  const key = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com";
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[event]", name, props);
    }
    return;
  }
  const distinctId =
    (props?.userId as string | undefined) ??
    (props?.companyId as string | undefined) ??
    "anonymous";
  void fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event: name,
      distinct_id: distinctId,
      properties: {
        ...props,
        $lib: "plott-backend",
      },
    }),
  }).catch(() => {
    /* silent */
  });
}
