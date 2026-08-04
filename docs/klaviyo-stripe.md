# Klaviyo Stripe Integration

Plott uses two Stripe webhook endpoints with different responsibilities.

## Plott App Webhook

Endpoint:

```text
https://plott.uk/api/webhooks/stripe
```

Owner:

- `src/app/api/webhooks/stripe/route.ts`

Purpose:

- Apply subscription state to `Company`.
- Keep app access and entitlement gates in sync.
- Refresh Stripe price metadata caches.
- Capture app analytics for subscription activation/cancellation.

Required events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.trial_will_end`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Do not replace this endpoint with Klaviyo's endpoint. The Klaviyo webhook does
not update Plott's database.

## Klaviyo Stripe Webhook

Endpoint:

```text
KLAVIYO_WEBHOOK_URL
```

Purpose:

- Send Stripe billing events directly to Klaviyo for marketing automation,
  billing segmentation, dunning, and lifecycle flows.

Configure with:

```bash
npm run stripe:ensure-klaviyo-webhook
```

The script creates or updates a second Stripe webhook endpoint with these
events:

- `charge.captured`
- `charge.expired`
- `charge.failed`
- `charge.pending`
- `charge.refunded`
- `charge.succeeded`
- `charge.updated`
- `invoice.created`
- `invoice.deleted`
- `invoice.finalized`
- `invoice.marked_uncollectible`
- `invoice.payment_action_required`
- `invoice.payment_failed`
- `invoice.payment_succeeded`
- `invoice.sent`
- `invoice.upcoming`
- `invoice.updated`
- `invoice.voided`

If the endpoint is newly created, Stripe returns a signing secret once. Store it
as `KLAVIYO_WEBHOOK_SECRET` if Klaviyo asks for the Stripe signing secret.

## Plott-To-Klaviyo Events

Plott also sends custom app events through `src/lib/klaviyo-marketing.ts`.
These are not billing primitives and should stay in the app:

- marketing lead capture (`Marketing Lead Submitted`)
- onboarding finished (`Onboarding Completed`) — workspace set up, not yet paid
- checkout started (`Checkout Started`)
- subscription welcome lifecycle (`Subscription Started` / `Trial Started`)
- saved search created
- onboarding/product activity that Stripe cannot observe

### Profile properties used by lifecycle flows

| Property | Set when | Meaning |
|----------|----------|---------|
| `funnel_stage` | onboarding / paid | `needs_plan` or `ready` |
| `has_paid` | onboarding / paid | `false` until first paid/trialing sub |
| `company_id` / `company_name` | both | Tenant context for personalisation |
| `subscription_status` | paid | Stripe status string |

## Finished signup / didn't pay flow

Build this in Klaviyo (Flows → Create Flow → Metric). Plott cannot create the
flow via API from this repo; the app only emits the metrics.

**Trigger metric:** `Onboarding Completed`

**Flow filters (recommended):**

- Profile `has_paid` is not `true` (or is unset / `false`)
- Optionally: has not done `Checkout Started` in the last 1 hour (avoid
  emailing someone mid-checkout)

**Exit / conversion criteria:**

- Anyone who receives `Subscription Started` **or** `Trial Started`
- Anyone whose profile `has_paid` becomes `true`

**Suggested timing (UK contractors, weekday-friendly):**

1. **+30 minutes** — “Your workspace is ready — pick a plan”
   CTA: `https://plott.uk/subscribe`
2. **+1 day** — Short reminder: Pro for growing contractors, cancel anytime
3. **+3 days** — Last nudge; mention letter templates / ICP starter filters
   from onboarding

**Copy notes:**

- Do not promise a free trial unless `STRIPE_TRIAL_DAYS` is > 0 in production.
- Current marketing copy: billed at checkout, cancel anytime.
- Prefer transactional / service messaging for account-completion reminders if
  the profile has not opted into marketing email. Lead-magnet subscribers
  already have marketing consent via `/api/marketing/subscribe`.

**Smoke test:**

1. Complete onboarding on a test account without paying.
2. Confirm Klaviyo Activity shows `Onboarding Completed` and
   `funnel_stage=needs_plan`, `has_paid=false`.
3. Complete checkout; confirm `Subscription Started` (or `Trial Started`) and
   `has_paid=true`.
4. Confirm the flow exits and no further abandon emails send.

## Validation

1. Run `npm run stripe:verify` to confirm the CLI and `STRIPE_SECRET_KEY` point
   at the same PLOTT Stripe account.
2. Run `npm run stripe:ensure-klaviyo-webhook`.
3. In Stripe Dashboard, send a test event such as `invoice.payment_succeeded`
   to the Klaviyo endpoint.
4. Confirm Klaviyo receives the metric/profile activity.
5. Run a test checkout and confirm both systems update:
   - Plott company subscription state changes.
   - Klaviyo receives invoice/charge lifecycle events.
