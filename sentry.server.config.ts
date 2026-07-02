// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const sentryDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,

    // The app registers its own OpenTelemetry NodeTracerProvider in
    // `src/instrumentation.ts` (for Langfuse + PostHog AI tracing). Let that
    // provider own OpenTelemetry so Sentry doesn't register a competing global
    // provider that would silently drop the AI spans. Error reporting and
    // `onRequestError` still work fully with this enabled.
    skipOpenTelemetrySetup: true,

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,

    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Enable sending user PII (Personally Identifiable Information)
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: true,
  });
}
