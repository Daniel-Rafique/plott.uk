/**
 * Lightweight facade over Sentry + PostHog that stays silent when not
 * configured. Avoids hard-importing @sentry/* so the app still builds without
 * them during initial setup.
 */

type Props = Record<string, string | number | boolean | null | undefined>;

export function captureError(
  err: unknown,
  context?: { userId?: string; companyId?: string; extra?: Props },
): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (process.env.NODE_ENV !== "production") {
    console.error("[error]", msg, context);
  }
  // Sentry wires up via `instrumentation.ts` when configured.
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
