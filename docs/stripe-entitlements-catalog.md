# Stripe Entitlements catalog (internal)

Plott **does not** gate product access through Stripe’s Entitlements API. The app resolves plan tier and feature limits from:

- `Company.subscriptionPriceId` → env `STRIPE_PRICE_*` mapping ([`src/lib/stripe/plan-prices.ts`](../src/lib/stripe/plan-prices.ts))
- Price metadata on licensed plan prices ([`src/lib/pricing.ts`](../src/lib/pricing.ts), [`src/lib/ai/tiers.ts`](../src/lib/ai/tiers.ts))
- [`src/lib/plan-features.ts`](../src/lib/plan-features.ts) for boolean gates (e.g. outreach, CSV export during trial)

Stripe Dashboard **Features** are optional documentation only: they describe which capabilities belong to each product without changing runtime behaviour.

## Features vs billing add-ons

| Stripe concept | Purpose in Plott |
| --- | --- |
| **Entitlements / Features** | Dashboard catalog; not read by the app |
| **Licensed plan prices** | Starter / Pro / Agency monthly & annual |
| **Metered price + Billing Meter** | AI usage over included allowance |
| **Licensed seat add-on prices** | Extra seats over plan limit (`STRIPE_PRICE_EXTRA_SEAT_*`) |

Features tell you *what access to grant*; they do not invoice customers. Billable add-ons always use **Prices** on the subscription.

## Feature catalog

| `lookup_key` | Name | Starter | Pro | Agency |
| --- | --- | --- | --- | --- |
| `csv_export` | CSV export | yes | yes | yes |
| `saved_searches` | Saved searches | | yes | yes |
| `pinned_applications` | Pinned applications | | yes | yes |
| `auto_outreach` | Autonomous outreach | | | yes |

Source: [`scripts/stripe-feature-catalog.ts`](../scripts/stripe-feature-catalog.ts)

## Sync to Stripe (optional)

```bash
npm run stripe:ensure-features          # report missing features / attachments
npm run stripe:ensure-features -- --fix # create features and attach to products
```

Products are resolved from monthly plan price env vars (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`).

## When to adopt Entitlements API in the app

Revisit wiring `entitlements.active_entitlement_summary.updated` if you:

- Sell à la carte modules (e.g. outreach without full Agency)
- Need non-engineers to remap plan → capabilities entirely in Dashboard
- Operate multiple apps on one Stripe billing account

Until then, keep Price metadata as the single runtime source of truth.

See also: [stripe-pricing.md](./stripe-pricing.md) (licensed prices, metadata, AI meter, extra seats).
