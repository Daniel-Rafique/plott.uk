<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into this Next.js App Router project. The integration covers client-side and server-side event tracking, user identification, a reverse proxy configuration, and automatic error capture.

**What was set up:**
- `instrumentation-client.ts` — PostHog JS client initialised at app boot via Next.js 15.3+ instrumentation hook, with reverse proxy, exception capture, and debug mode in development.
- `src/lib/posthog-server.ts` — Singleton `posthog-node` client for server-side event capture in API routes.
- `next.config.ts` — Reverse proxy rewrites (`/ingest/*`) added so PostHog traffic routes through your own domain. `skipTrailingSlashRedirect: true` added as required.
- `.env.local` — `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` set.
- User identification via `posthog.identify(email, ...)` on sign-in and sign-up (client-side), with matching `distinctId` on server-side events for cross-domain correlation.

## Events instrumented

| Event | Description | File |
|---|---|---|
| `sign_up` | User successfully creates a new account | `src/app/auth/sign-up/sign-up-form.tsx` |
| `sign_in` | User successfully signs in | `src/app/auth/sign-in/sign-in-form.tsx` |
| `onboarding_completed` | User completes the onboarding wizard | `src/app/onboarding/onboarding-wizard.tsx` |
| `checkout_initiated` | User clicks to start a Stripe checkout | `src/app/pricing/pricing-grid.tsx` |
| `subscription_activated` | Stripe webhook confirms checkout completed | `src/app/api/webhooks/stripe/route.ts` |
| `subscription_cancelled` | Stripe webhook confirms subscription deleted | `src/app/api/webhooks/stripe/route.ts` |
| `nl_search_applied` | User submits a natural language search query | `src/app/app/dashboard/nl-search-bar.tsx` |
| `proprietor_lookup_started` | User initiates a Land Registry proprietor lookup | `src/components/proprietor-letter-modal.tsx` |
| `letter_created` | A letter draft is created and persisted | `src/components/proprietor-letter-modal.tsx` + `src/app/api/letter/draft/route.ts` |
| `letter_ai_assist_applied` | User applies an AI rewrite to a letter | `src/components/letter-assist-drawer.tsx` |
| `team_member_invited` | Admin sends a team invite email | `src/app/api/team/invite/route.ts` |
| `saved_search_created` | User saves a map search area | `src/app/api/saved-searches/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/391522/dashboard/1493576
- **Signup → Onboarding → Subscription funnel**: https://us.posthog.com/project/391522/insights/xZzySTJ8
- **New signups over time**: https://us.posthog.com/project/391522/insights/naHLJj8d
- **Letters created per day**: https://us.posthog.com/project/391522/insights/Ow2An0PV
- **AI feature engagement**: https://us.posthog.com/project/391522/insights/lLRDNdE0
- **Subscription activations vs cancellations**: https://us.posthog.com/project/391522/insights/E2MtME13

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
