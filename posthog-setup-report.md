<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Plott. The project already had a solid foundation (posthog-js + posthog-node installed, `instrumentation-client.ts` initialised, reverse proxy rewrites in `next.config.ts`, a server-side `captureServerEvent` helper, and events on sign-up, sign-in, onboarding, Stripe webhooks, and letter drafts). The wizard extended this with six new events across four files, refreshed the environment variable values, and created a PostHog dashboard with five insights.

## Events instrumented

| Event | Description | File |
|---|---|---|
| `sign_up` | User creates a new account | `src/app/auth/sign-up/sign-up-form.tsx` |
| `sign_in` | User signs in to an existing account | `src/app/auth/sign-in/sign-in-form.tsx` |
| `onboarding_completed` | User finishes the onboarding wizard | `src/app/onboarding/onboarding-wizard.tsx` |
| `subscription_activated` | Stripe confirms a new paid subscription | `src/app/api/webhooks/stripe/route.ts` |
| `subscription_cancelled` | Stripe confirms a subscription was deleted | `src/app/api/webhooks/stripe/route.ts` |
| `letter_created` | A persisted letter draft is saved | `src/app/api/letter/draft/route.ts` |
| `deep_search_completed` | AI deep-search query returns results | `src/app/app/dashboard/dashboard-client.tsx` |
| `deep_search_manual_filters_submitted` | User-adjusted filters re-trigger a deep search | `src/app/app/dashboard/dashboard-client.tsx` |
| `checkout_initiated` | User clicks a plan card to begin Stripe checkout | `src/app/subscribe/subscribe-panel.tsx` |
| `application_pinned` | User pins a planning application for tracking | `src/app/app/dashboard/dashboard-client.tsx` |
| `application_unpinned` | User removes a planning application from pins | `src/app/app/dashboard/dashboard-client.tsx` |
| `search_saved` | User saves the current map area as a named search | `src/app/app/dashboard/dashboard-client.tsx` |
| `csv_exported` | User exports planning results as a CSV | `src/app/app/dashboard/dashboard-client.tsx` |
| `letter_pdf_downloaded` | User renders or downloads a letter as a PDF | `src/app/api/letter/pdf/route.ts` |

## LLM analytics (AI Observability)

PostHog AI Observability is wired into all server-side LLM calls via the Vercel AI SDK's OpenTelemetry integration. Every call to `runText`, `runObject`, `runAgent`, and `runStream` in `src/lib/ai/runtime.ts` now emits `$ai_generation` events to PostHog automatically, capturing model name, latency, input/output token counts, and cost.

### How it works

- **`@posthog/ai`** installed — provides `PostHogSpanProcessor` for the OTel pipeline.
- **`src/instrumentation.ts`** updated — `PostHogSpanProcessor` is registered alongside `LangfuseSpanProcessor` in the `NodeTracerProvider`. Both are guarded by their respective env vars; either can be absent without affecting the other.
- **`src/lib/ai/runtime.ts`** updated — `getTelemetrySettings` now sets `isEnabled: true` unconditionally (previously it was gated on Langfuse being active) and adds `posthog_distinct_id: ctx.userId` to span metadata so generations are linked to specific users in PostHog AI Observability.

### Agent kinds tracked

All 11 agent kinds route through the same runtime and are automatically observed:

| Agent kind | Model | Primary use |
|---|---|---|
| `nl_search` | GPT-4.1 | Natural-language search parsing |
| `letter_assist` | GPT-4.1 | AI letter tone rewrite |
| `compliance_guardrail` | Claude Haiku | Pre-send compliance check |
| `enrichment_agent` | Claude Sonnet | Applicant/agent contact enrichment |
| `applicant_research` | Claude Sonnet | Deep applicant research |
| `digest_summary` | Claude Haiku | Weekly saved-search digest |
| `icp_classifier` | Claude Haiku | Ideal customer profile scoring |
| `outreach_drafter` | Claude Sonnet | Autonomous outreach email draft |
| `appeal_classifier` | Claude Haiku | Planning appeal classification |
| `appeal_pitch_drafter` | Claude Sonnet | Appeal pitch letter draft |
| `planning_qa` | Claude Sonnet | Interactive planning Q&A chat |

### Check for generations in PostHog

Once deployed, visit [AI Observability → Generations](https://us.posthog.com/ai-observability/generations) in your PostHog project to confirm `$ai_generation` events are appearing.

## Next steps

We've built a dashboard and five insights to monitor user behaviour:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/475834/dashboard/1729560)
- [Signups & Onboarding (wizard)](https://us.posthog.com/project/475834/insights/lVltAl6J)
- [Activation Funnel (wizard)](https://us.posthog.com/project/475834/insights/e2oV9ZpV)
- [Core Feature Usage (wizard)](https://us.posthog.com/project/475834/insights/rYdumX0N)
- [Subscription Health (wizard)](https://us.posthog.com/project/475834/insights/8EVH9s0F)
- [User Engagement Actions (wizard)](https://us.posthog.com/project/475834/insights/l9YdplUb)

## Verify before merging

- [ ] Run a full production build (`npm run build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` (and any team bootstrap scripts) so collaborators know what values to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify in PostHog Error Tracking.
- [ ] Confirm the returning-visitor path also calls `identify` — the current implementation identifies on fresh login/signup; a user returning via a stored session starts on an anonymous distinct ID until they sign in again.
- [ ] Trigger one of the LLM call paths (e.g. the planning Q&A chat or a deep search) and confirm `$ai_generation` events appear in PostHog AI Observability.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
</wizard-report>
