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

Create/update the draft flow via the Flows API:

```bash
npm run klaviyo:ensure-signup-abandon-flow
# rewrite library CODE HTML + re-point live flow emails (Klaviyo clones templates)
npm run klaviyo:ensure-signup-abandon-flow -- --force-templates
```

Script: `scripts/ensure-klaviyo-signup-abandon-flow.ts`

What it provisions (idempotent):

- Metric `Onboarding Completed` (seeds a one-off event if the metric is missing)
- Three CODE HTML templates (CTA → `https://plott.uk/subscribe`)
- Draft flow **Finished signup / didn't pay**
  - Trigger: `Onboarding Completed`
  - Profile + per-email filters: zero `Subscription Started` and zero
    `Trial Started` since flow start
  - Delays: 30 minutes → Email 1 → 1 day → Email 2 → 2 days → Email 3
  - Messages marked `transactional: true` (account-completion, not promo)

`--force-templates` updates the library templates **and** reassigns each flow
email to those templates. Flow-owned clones cannot be PATCHed directly (API
404), so reassignment is required for live copy to change.

Flows are always created in **Draft**. Review copy in Klaviyo, then set Live.

**Copy notes:**

- Do not promise a free trial unless `STRIPE_TRIAL_DAYS` is > 0 in production.
- Current marketing copy: billed at checkout, cancel anytime.

**Smoke test:**

1. Deploy app changes that emit `Onboarding Completed`.
2. Complete onboarding on a test account without paying.
3. Confirm Klaviyo Activity shows `Onboarding Completed` and
   `funnel_stage=needs_plan`, `has_paid=false`.
4. Complete checkout; confirm `Subscription Started` (or `Trial Started`) and
   `has_paid=true`.
5. Confirm the flow exits and no further abandon emails send.

## Hunter construction warm list flow

For warm imports (e.g. Hunter construction profiles), use a **list-triggered**
nurture series — not the signup-abandon metric flow.

```bash
npm run klaviyo:ensure-hunter-warm-flow
```

Script: `scripts/ensure-klaviyo-hunter-warm-flow.ts`

Provisions:

- List **Hunter Construction Warm**
- Draft flow **Hunter construction warm nurture**
  - Trigger: Added to that list
  - Skips anyone who already has `Subscription Started` or `Trial Started`
  - Emails: immediate intro → +2 days → +3 days
  - CTAs → `plott.uk` / sign-up (not subscribe)

**Import steps:**

1. Set the flow Live after reviewing copy.
2. Import the CSV into **Hunter Construction Warm** (not the main Email List).
3. Mark email marketing consent for profiles you are allowed to email.
4. Adding someone to the list is what starts the flow.

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
