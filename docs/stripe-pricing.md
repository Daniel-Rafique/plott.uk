# Stripe pricing, metadata, and AI metered overage

Operational reference for configuring **subscription prices**, **Price metadata** (read by the app for AI budgets and saved-search limits), and **metered billing** for AI usage beyond the included monthly allowance.

The app reads these keys from each plan’s **Stripe Price** metadata (product metadata is merged in `src/lib/ai/tiers.ts` and `src/lib/pricing.ts` when present):

| Metadata key | Purpose |
| --- | --- |
| `ai_monthly_budget_gbp` | Included AI allowance in GBP for the billing period (shown in-app; used for overage calculation). |
| `saved_search_limit` | Max saved searches for the plan (`0` = none). |
| `ai_overage_rate` | Multiplier applied to **overage** cost before reporting to Stripe (default **2** if unset). Not shown to end users in the billing UI. |

Environment variables:

| Variable | Purpose |
| --- | --- |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_AGENCY` | Monthly licensed prices for each tier. |
| `STRIPE_PRICE_AI_OVERAGE` | Optional. Metered price ID for AI overage (1 unit = £0.01). Used for documentation and future checkout automation; **meter events** use the meter `event_name`, not this ID directly. |

---

## Prerequisites

- [Stripe CLI](https://stripe.com/docs/stripe-cli) installed and logged in (`stripe login`).
- Use **`--live`** for production commands when you mean live mode (default for CLI is often test mode unless you pass `--live`).

Replace placeholder IDs with values from **Stripe Dashboard → Product catalogue** or from your `.env` (see below).

---

## Update plan Price metadata (CLI or script)

**Automated (recommended):** with `STRIPE_SECRET_KEY` and `STRIPE_PRICE_*` in `.env` / `.env.local`, run `npm run stripe:ensure-prices` to verify, or `npm run stripe:ensure-prices -- --fix` to set metadata. Implementation: `scripts/ensure-stripe-prices.ts`.

**Manual** — paste price IDs from the Dashboard or load them from a local env file:

```bash
set -a && source .env.local && set +a   # or: export STRIPE_PRICE_STARTER=price_...

stripe prices update "$STRIPE_PRICE_STARTER" \
  -d "metadata[ai_monthly_budget_gbp]=10" \
  -d "metadata[saved_search_limit]=0" \
  -d "metadata[ai_overage_rate]=2"

stripe prices update "$STRIPE_PRICE_PRO" \
  -d "metadata[ai_monthly_budget_gbp]=25" \
  -d "metadata[saved_search_limit]=5" \
  -d "metadata[ai_overage_rate]=2"

stripe prices update "$STRIPE_PRICE_AGENCY" \
  -d "metadata[ai_monthly_budget_gbp]=100" \
  -d "metadata[saved_search_limit]=20" \
  -d "metadata[ai_overage_rate]=2"
```

**PLOTT sandbox (test) — example price ids** (from Dashboard with Test mode on; your account may differ — use `STRIPE_PRICE_*` in `.env` or the ids from **Product catalogue**):

| Tier | Example `price_...` (PLOTT test) |
| --- | --- |
| Starter | `price_1TQrE0CtRQ4U4oBVnSEUVQ8d` |
| Pro | `price_1TQrE0CtRQ4U4oBVSZbQxrGe` |
| Agency | `price_1TQrE1CtRQ4U4oBVPfDTKvRX` |

After changing metadata, the app refreshes cached values on subscription-related webhooks (`invalidateStripeMetaCache`). In dev, restart the server or trigger a webhook if you need picks up immediately.

---

## AI overage meter (one-time setup per Stripe account)

Usage beyond the included budget is reported with **`stripe.billing.meterEvents.create`** (`event_name: ai_overage`). You need a **Billing Meter** and a **metered Price** so Stripe can invoice reported usage.

### 1. Create the meter

```bash
stripe billing meters create \
  --display-name="AI Overage (GBP pennies)" \
  --event-name=ai_overage \
  --default-aggregation.formula=sum \
  --value-settings.event-payload-key=value \
  --customer-mapping.type=by_id \
  --customer-mapping.event-payload-key=stripe_customer_id
```

Note the returned `id` (e.g. `mtr_test_...`) as `METER_ID`.

### 2. Create a metered price (£0.01 per unit; 1 unit = 1 penny of charge)

Use a **product** that belongs to your app (any of the plan products is fine; overage is a separate line item).

```bash
stripe prices create \
  --currency=gbp \
  --product=YOUR_PRODUCT_ID \
  --nickname="AI Overage (per penny)" \
  --recurring.interval=month \
  --recurring.usage-type=metered \
  --recurring.meter=METER_ID \
  --unit-amount=1 \
  -d "metadata[purpose]=ai_overage"
```

Set `STRIPE_PRICE_AI_OVERAGE` in Vercel / `.env` to this price id.

### 3. Attach the metered item to subscriptions

New and existing subscriptions must include the metered **subscription item** for overage to appear on invoices. Options:

- **Stripe Dashboard** — open the subscription → add item → select the AI overage price.
- **Stripe API** — `subscription_items.create` with the metered `price`.
- **Checkout** — extend `line_items` in `src/app/api/stripe/checkout/route.ts` to add the overage price when you want every new signup to include it automatically (not required for emitting meter events, but required for Stripe to bill the usage).

The application reports usage to the **meter**; billing still depends on the customer having a subscription line item that uses that meter’s price.

---

## Webhooks

No extra webhook events are required for metered usage aggregation beyond your existing subscription and invoice handlers. Ensure `customer.subscription.*` events remain enabled so metadata cache invalidation runs after plan changes.

For the exact event names and endpoint URL, see [stripe-new-account.md](./stripe-new-account.md).

---

## Related code

- `src/lib/ai/tiers.ts` — loads Price metadata, `ai_overage_rate`, budget cap.
- `src/lib/ai/metering.ts` — `reportAiOverage()` → `billing.meterEvents.create`.
- `src/lib/ai/runtime.ts` — `persistFinish()` computes overage after each successful run.
- `src/lib/pricing.ts` — marketing/pricing page feature lines from metadata.
