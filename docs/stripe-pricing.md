# Stripe pricing, metadata, and AI metered overage

Operational reference for configuring **subscription prices** (monthly and annual), **Price metadata**, and **metered billing** for AI usage beyond the included monthly allowance.

Canonical catalog and allowance model: [stripe-pricing-audit.md](./stripe-pricing-audit.md).

## Licensed prices

| Tier | Monthly | Annual (2 months free) |
|------|---------|------------------------|
| Starter | £49.99 | £499.90 |
| Pro | £99 | £990 |
| Agency | £199 | £1,990 |

The app reads these keys from each plan’s **Stripe Price** metadata (product metadata is merged in `src/lib/ai/tiers.ts` and `src/lib/pricing.ts` when present):

| Metadata key | Purpose |
| --- | --- |
| `ai_monthly_budget_gbp` | Included AI allowance in GBP per calendar month (same for monthly and annual prices). |
| `saved_search_limit` | Max saved searches for the plan (`0` = none). |
| `pinned_application_limit` | Max pinned applications (`0` = none). |
| `auto_outreach` | `true` on Agency only. |
| `ai_overage_rate` | Multiplier applied to **overage** cost before reporting to Stripe (default **4** if unset). |

Environment variables:

| Variable | Purpose |
| --- | --- |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_AGENCY` | Monthly licensed prices. |
| `STRIPE_PRICE_STARTER_ANNUAL` / `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_AGENCY_ANNUAL` | Annual licensed prices. |
| `STRIPE_PRICE_AI_OVERAGE` | Metered price ID for AI overage (1 unit = £0.01). Required on subscriptions for overage to invoice. |
| `STRIPE_PRICE_EXTRA_SEAT_PRO` / `_PRO_ANNUAL` | Licensed per-seat add-on when Pro teams exceed included seats. |
| `STRIPE_PRICE_EXTRA_SEAT_AGENCY` / `_AGENCY_ANNUAL` | Licensed per-seat add-on when Agency teams exceed included seats. |

---

## App entitlements vs Stripe Features

Runtime feature gates use **Price metadata** and [`src/lib/plan-features.ts`](../src/lib/plan-features.ts), not Stripe’s Entitlements API. Dashboard **Features** are optional internal documentation — see [stripe-entitlements-catalog.md](./stripe-entitlements-catalog.md).

```bash
npm run stripe:ensure-features          # optional Dashboard feature catalog
npm run stripe:ensure-features -- --fix
```

---

## Extra seats (licensed add-on)

Pro and Agency allow team members beyond the included seat count. When `STRIPE_PRICE_EXTRA_SEAT_*` is configured, the app updates a **third subscription line item** (quantity = seats over limit) on invite / member removal via [`src/lib/stripe/sync-seat-billing.ts`](../src/lib/stripe/sync-seat-billing.ts).

```bash
npm run stripe:ensure-seat-prices          # verify seat add-on prices
npm run stripe:ensure-seat-prices -- --fix # create missing prices
```

| Plan | Monthly per extra seat | Annual per extra seat (10× monthly) |
| --- | --- | --- |
| Pro | £99 | £990 |
| Agency | £99 | £990 |

Seat add-on interval must match the company’s plan billing interval (monthly vs annual licensed price).

---

## Prerequisites

- [Stripe CLI](https://stripe.com/docs/stripe-cli) installed and logged in (`stripe login`).
- Use **`--live`** for production commands when you mean live mode.

Replace placeholder IDs with values from **Stripe Dashboard → Product catalogue** or from `npm run stripe:create-products`.

---

## Verify and fix (recommended)

```bash
npm run stripe:audit
npm run stripe:ensure-prices          # check only
npm run stripe:ensure-prices -- --fix # apply metadata from catalog
npm run stripe:ensure-ai-meter
```

Implementation: [`scripts/stripe-plan-catalog.ts`](../scripts/stripe-plan-catalog.ts), [`scripts/ensure-stripe-prices.ts`](../scripts/ensure-stripe-prices.ts), [`scripts/audit-stripe-pricing.ts`](../scripts/audit-stripe-pricing.ts).

**Manual metadata** (monthly and annual prices share the same values per tier):

```bash
set -a && source .env.local && set +a

stripe prices update "$STRIPE_PRICE_STARTER" \
  -d "metadata[ai_monthly_budget_gbp]=10" \
  -d "metadata[saved_search_limit]=0" \
  -d "metadata[pinned_application_limit]=0" \
  -d "metadata[ai_overage_rate]=4"

stripe prices update "$STRIPE_PRICE_PRO" \
  -d "metadata[ai_monthly_budget_gbp]=25" \
  -d "metadata[saved_search_limit]=5" \
  -d "metadata[pinned_application_limit]=5" \
  -d "metadata[ai_overage_rate]=4"

stripe prices update "$STRIPE_PRICE_AGENCY" \
  -d "metadata[ai_monthly_budget_gbp]=75" \
  -d "metadata[saved_search_limit]=20" \
  -d "metadata[pinned_application_limit]=20" \
  -d "metadata[auto_outreach]=true" \
  -d "metadata[ai_overage_rate]=4"
```

Repeat the same metadata on each tier’s `STRIPE_PRICE_*_ANNUAL` price id.

After changing metadata, the app refreshes cached values on subscription webhooks (`invalidateStripeMetaCache`).

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
