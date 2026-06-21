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

- marketing lead capture
- checkout started
- subscription welcome lifecycle
- saved search created
- onboarding/product activity that Stripe cannot observe

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
