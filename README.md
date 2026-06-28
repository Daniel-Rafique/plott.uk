# Plott

A multi-tenant SaaS for UK construction firms. Turns open planning applications
into signed contracts via a 3D map, applicant enrichment, branded letter
generation and saved-search email digests.

## Stack

- Next.js 16 (App Router, React 19, Server Components)
- Prisma 6 + Neon Postgres
- Neon Auth (session cookies + hosted UI)
- Stripe (three-tier subscription + billing portal + webhooks)
- Vercel Blob (logos, uploaded signatures, generated PDFs)
- Google Maps Platform (photorealistic 3D tiles, Street View fallback)
- Resend + React Email for transactional mail
- Upstash Redis for rate limiting
- Vercel AI SDK + AI Gateway (multi-provider LLM routing)
- Vitest + Playwright for tests

## Third-Party Integrations

| Service | Purpose | Required | Env Vars |
|---------|---------|----------|----------|
| **Neon Postgres** | Primary database (Prisma ORM) | Yes | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` |
| **Neon Auth** | Session-based authentication with hosted UI | Yes | `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` |
| **Stripe** | Subscriptions, billing portal, webhooks, AI metered overage | Yes | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_STARTER` / `_PRO` / `_AGENCY`, optional `STRIPE_PRICE_AI_OVERAGE` |
| **Google Maps Platform** | 3D photorealistic maps, Street View, geocoding | Yes | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, `GOOGLE_MAPS_STATIC_API_KEY` |
| **Vercel Blob** | File storage for logos, signatures, generated PDFs | Yes | `BLOB_READ_WRITE_TOKEN` |
| **Resend** | Transactional email (digests, invites, reminders) | Yes | `RESEND_API_KEY`, `RESEND_FROM` |
| **Upstash Redis** | Rate limiting via Vercel KV | Yes | `KV_REST_API_URL`, `KV_REST_API_TOKEN`, etc. |
| **Vercel AI Gateway** | LLM routing (Claude, GPT, Gemini) with cost tracking | Yes | `AI_GATEWAY_API_KEY` (auto on Vercel) |
| **PlanWire** | UK planning application data API | Yes | `PLANWIRE_API_KEY` |
| **PropertyData** | UK property and land registry data | Yes | `PROPERTYDATA_API_KEY` |
| **Companies House** | UK company lookup (free gov API) | Optional | `COMPANIES_HOUSE_API_KEY` |
| **Hunter** | Structured email discovery and verification for outreach enrichment | Optional | `HUNTER_API_KEY` |
| **Tavily** | Web search for AI agent grounding | Optional | `TAVILY_API_KEY` |
| **Langfuse** | LLM observability — traces, costs, debugging | Optional | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` |
| **Vercel Workflows** | Durable workflows for autonomous outreach started by Vercel Cron | Yes in production for auto-outreach | No extra env vars |
| **Sentry** | Error tracking and performance monitoring | Optional | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` |
| **PostHog** | Product analytics and feature flags | Optional | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` |

### Integration Details

#### AI Platform

The app uses the **Vercel AI SDK** with models routed through **Vercel AI Gateway**:

- **Claude Sonnet** — multi-step agents (enrichment, research, outreach drafting)
- **Claude Haiku** — high-volume checks (compliance guardrails, ICP classification)
- **GPT-4.1** — low-latency structured outputs (NL search parsing, letter assists)

AI agents are budget-controlled per tenant with daily spend caps. **Langfuse** provides full observability with OpenTelemetry-based tracing of every LLM call, tool execution, and cost.

#### Planning Data

- **PlanWire** — primary source for UK planning applications, applicant/agent contacts
- **PropertyData** — property ownership, land registry, title data
- **Companies House** — UK company verification and director lookups

#### Observability Stack

- **Langfuse** — LLM tracing with cost attribution, prompt debugging, quality monitoring
- **Sentry** — runtime errors, unhandled exceptions, performance
- **PostHog** — user analytics, funnels, feature usage

## Getting started

```bash
cp .env.example .env.local   # fill secrets
npm install
npx prisma migrate deploy    # or: npx prisma db push  (dev only)
npm run dev                  # http://localhost:3000
```

### Stripe setup

**New or alternate Stripe account:** use [docs/stripe-new-account.md](./docs/stripe-new-account.md) for keys, webhook events, and migration notes. The Plott Dashboard account is **PLOTT**; confirm CLI and `.env` match with `npm run stripe:verify`.

1. **Automated (recommended):** with `STRIPE_SECRET_KEY` in `.env.local`, run `npm run stripe:create-products` once — it creates three products, monthly GBP prices, and sets Price metadata. Paste the printed lines into `.env.local`.
2. **Manual:** create three monthly recurring Prices in Stripe, paste `price_*` ids into `STRIPE_PRICE_STARTER` / `_PRO` / `_AGENCY`, then run `npm run stripe:ensure-prices -- --fix` to set metadata.
3. **Metadata reference** (already applied by `create-stripe-products` / `ensure-prices --fix`). Manual Stripe CLI example:

   ```bash
   set -a && source .env.local && set +a

   stripe prices update "$STRIPE_PRICE_STARTER" \
     -d "metadata[ai_monthly_budget_gbp]=10" \
     -d "metadata[saved_search_limit]=0" \
     -d "metadata[ai_overage_rate]=4"

   stripe prices update "$STRIPE_PRICE_PRO" \
     -d "metadata[ai_monthly_budget_gbp]=25" \
     -d "metadata[saved_search_limit]=5" \
     -d "metadata[ai_overage_rate]=4"

   stripe prices update "$STRIPE_PRICE_AGENCY" \
     -d "metadata[ai_monthly_budget_gbp]=100" \
     -d "metadata[saved_search_limit]=20" \
     -d "metadata[ai_overage_rate]=4"
   ```

4. **AI metered overage (optional but recommended for billing beyond included AI):** create a Billing Meter (`event_name: ai_overage`), a metered price at £0.01/unit linked to that meter, set `STRIPE_PRICE_AI_OVERAGE`, and attach that price as a subscription item for customers who should be invoiced for overage. Full CLI steps and notes: [docs/stripe-pricing.md](./docs/stripe-pricing.md).

5. Create a webhook endpoint pointing at `/api/webhooks/stripe` with events:
   `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`.
6. Paste the signing secret into `STRIPE_WEBHOOK_SECRET`.
7. Turn on `Stripe Tax` if UK VAT applies and set `STRIPE_AUTOMATIC_TAX=true`.

### Google Maps

- Enable the Maps JavaScript API (with Map 3D tiles) and Street View Static API.
- Create a **vector-enabled Map ID** in Cloud Console → Map Management; paste
  into `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. 3D mode requires this.

### Vercel Blob

- Create a Blob store in the Vercel dashboard and copy the read/write token
  into `BLOB_READ_WRITE_TOKEN`.

## Scripts

| Script              | Description                                     |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Next.js dev server with Turbopack               |
| `npm run build`     | `prisma generate && next build`                 |
| `npm run db:push`   | Push schema (dev only — skips migrations)       |
| `npm run db:migrate`| Generate + apply migrations (dev)               |
| `npm run test`      | Vitest unit suite                               |
| `npm run test:e2e`  | Playwright end-to-end                           |
| `npm run evals`     | AI regression harness (LLM suites + threshold); see [docs/ai-evals.md](./docs/ai-evals.md) |

Scheduled **GitHub Actions** evals (secrets, `companyId`, troubleshooting): [docs/ai-evals.md](./docs/ai-evals.md).

## Cron jobs

Vercel Cron is configured via `vercel.json` (see that file for schedules). Notable handlers:

- `/api/cron/saved-searches` — fetches PlanWire results for saved searches, sends email digests when configured, and **starts Vercel Workflows** when auto-outreach is enabled (Agency + AI on).
- `/api/cron/reminders` — daily sweep of `Reminder` rows due today.

These routes require `CRON_SECRET`: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when the secret is configured in the project.

### Autonomous outreach — production checklist

For the Outreach inbox (`/app/outreach`) to fill in a deployed environment:

1. **`CRON_SECRET`** — set in Vercel; cron must return 200 for `/api/cron/saved-searches`, not 401.
2. **Workflow SDK** — deploy on Vercel with the `workflow` package and `withWorkflow(nextConfig)` enabled; check logs for `cron_outreach_workflows_started`.
3. **Redis/KV rate limiting** — configure Vercel KV (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) or Upstash Redis (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). Production fails closed without a working limiter.
4. **Email + storage** — configure `RESEND_API_KEY`, `EMAIL_FROM`, and `BLOB_READ_WRITE_TOKEN` before enabling auto-outreach, prospect email sends, or PDF delivery.
5. **Enrichment providers** — set `PLANWIRE_API_KEY`; optionally set `COMPANIES_HOUSE_API_KEY`, `TAVILY_API_KEY`, and `HUNTER_API_KEY` for stronger contact enrichment.
6. **Database migration** — run `npx prisma migrate deploy` during deployment so workflow, email audit, and enrichment columns are available before the new code handles outreach requests.

Details for operators: [docs/outreach-guide.md](./docs/outreach-guide.md) (troubleshooting and verification).

## Multi-tenancy

Every tenant is a `Company` with `Membership` rows joining users. Every
request that touches tenant-scoped data calls `getTenantContext()` which
resolves the user, their active company, and their role. API routes call
`requireSubscribedTenant()` which adds subscription gating.

## License

Proprietary — © Plott Ltd.
