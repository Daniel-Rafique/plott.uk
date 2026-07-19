<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Observability

PLOTT uses three tools. They overlap slightly on client-side exceptions, but each has a distinct job. **Keep all three.**

| Tool | Purpose | Audience |
|------|---------|----------|
| **Sentry** | Runtime errors, stack traces, session replay, alerting | Engineering — "is the app broken?" |
| **PostHog** | Product analytics, funnels, feature flags, AI generation metrics | Product — "how are people using it?" |
| **Langfuse** | Deep LLM tracing, prompt debugging, per-call cost attribution | AI engineering — "why did this generation fail?" |

### When to use which

- **Unhandled exceptions, crashes, API/webhook failures** → Sentry (`captureError` in `src/lib/observability.ts`)
- **User actions, funnels, feature usage, experiments** → PostHog (`trackEvent` in `src/lib/observability.ts`, or `posthog-js` on the client)
- **LLM call traces, token cost, prompt inspection** → Langfuse + PostHog AI Observability (automatic via OpenTelemetry)

Do **not** remove Sentry or PostHog because of overlap. Sentry is the source of truth for **errors**; PostHog is the source of truth for **product and AI analytics**.

### Where it is wired

| Surface | File | What it does |
|---------|------|--------------|
| Server startup | `src/instrumentation.ts` | Sentry server init, Langfuse/PostHog OTel span processors, `onRequestError` |
| Browser | `src/instrumentation-client.ts` | Sentry client + replay, PostHog init, router transition tracking |
| Edge | `sentry.edge.config.ts` | Sentry for middleware / edge routes |
| App facade | `src/lib/observability.ts` | `captureError()` → Sentry, `trackEvent()` → PostHog |
| Global errors | `src/app/global-error.tsx` | Calls `captureError()` on root-level React errors |
| Build / source maps | `next.config.ts` | `withSentryConfig` — org `koynlabs`, project `plott`, tunnel `/monitoring` |

### OpenTelemetry ownership

`src/instrumentation.ts` registers a custom `NodeTracerProvider` for Langfuse and PostHog AI spans. Sentry server config sets `skipOpenTelemetrySetup: true` so it does **not** register a competing global tracer provider (which would silently drop AI spans). Sentry error reporting and `onRequestError` still work fully; only Sentry's own server performance traces are disabled in favour of Langfuse/PostHog for AI call observability.

### Env vars

```
NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN   # Sentry DSN (client + server)
SENTRY_AUTH_TOKEN                      # Source map uploads (CI / production builds)
SENTRY_ORG=koynlabs                    # Slug, not numeric ID
SENTRY_PROJECT=plott                   # Slug, not numeric ID
SENTRY_UPLOAD_SOURCE_MAPS=true         # Enable in CI when SENTRY_AUTH_TOKEN is set

NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN      # PostHog project token (client + AI OTel)
NEXT_PUBLIC_POSTHOG_HOST               # e.g. https://us.i.posthog.com
POSTHOG_API_KEY / POSTHOG_HOST         # Server-side event capture (trackEvent)

LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL
LANGFUSE_DISABLE=1                     # Opt out of Langfuse tracing
```

### Conventions for new code

- Use `captureError(err, { userId, companyId, extra })` for anything that should wake someone up — never swallow errors silently in production paths.
- Use `trackEvent(name, props)` for intentional product signals (signup, upload, checkout, agent run completed).
- Do not add a fourth error-reporting path; Sentry already covers client, server, edge, and global errors.
- PostHog has `capture_exceptions: true` on the client — that is fine, but treat Sentry as the canonical error tool for debugging and alerting.

## Hunter.io (enrichment)

Hunter is a first-party enrichment provider (email discovery / verification / company context). **Plott’s product runtime uses the typed REST client only** — [`src/lib/ai/tools/hunter.ts`](src/lib/ai/tools/hunter.ts) — wired into the deterministic cascade ([`src/lib/company-lookup.ts`](src/lib/company-lookup.ts), [`src/lib/enrichment.ts`](src/lib/enrichment.ts)) and the enrichment agent toolset.

**Do not** route enrichment, research, or outreach agents through [Hunter MCP](https://hunter.io/mcp) (`https://mcp.hunter.io/mcp`). MCP is a valid Hunter product for external AI assistants (Claude, ChatGPT, Cursor) on the same plan/credits, but it is not part of Plott’s in-app pipeline:

- Enrichment is deterministic-first under serverless time budgets; MCP re-centres “assistant decides when to call Hunter.”
- Results must land in `ApplicationEnrichment` with provenance (`source`, confidence, verification) — not Hunter Leads lists.
- There is no in-app MCP client; the vendor is already reachable via `fetch` with fail-closed behaviour when `HUNTER_API_KEY` is absent.

If product needs more Hunter surface area (Discover, Person Enrichment, etc.), **extend the REST client** and call it from the existing cascade / agent tools — never by adding MCP to the Next.js runtime.

