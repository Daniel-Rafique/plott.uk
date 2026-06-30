# Stripe pricing audit and allowance model

Pre-launch reference for licensed prices, included AI, and metered overage economics.

## Licensed prices (catalog)

Source of truth: [`scripts/stripe-plan-catalog.ts`](../scripts/stripe-plan-catalog.ts).

| Tier | Monthly | Annual (10× monthly, 2 months free) | Included AI / month |
|------|---------|--------------------------------------|---------------------|
| Starter | £49.99 | £499.90 | £10 |
| Pro | £99 | £990 | £25 |
| Agency | £199 | £1,990 | £75 |

Annual subscribers receive the **same monthly included AI credit** (`ai_monthly_budget_gbp`). Spend resets on a rolling ~31-day window in `src/lib/ai/guardrails.ts` — not 12× upfront.

## Margin model (subscription + included AI)

Assumes UK card fees ~1.5% + £0.20 per charge and **100% use of included AI** (worst case before overage):

| Tier | Monthly net (approx.) | Max AI COGS | Gross after AI |
|------|----------------------|-------------|----------------|
| Starter | ~£48.50 | £10 | ~£38.50 (~79%) |
| Pro | ~£96.30 | £25 | ~£71.30 (~74%) |
| Agency | ~£193.80 | £75 | ~£118.80 (~61%) |

**Overage:** billed at `ai_overage_rate` × internal AI cost (default **4×**). Each £1 of AI cost above allowance yields ~£4 invoice revenue (~75% margin on marginal AI).

## Audit commands

```bash
npm run stripe:verify
npm run stripe:audit              # read-only report (exit 1 on errors)
npm run stripe:ensure-prices      # verify catalog vs Stripe
npm run stripe:ensure-prices -- --fix
npm run stripe:ensure-ai-meter
npm run stripe:create-products    # create new price_* ids after catalog changes
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `STRIPE_PRICE_STARTER` / `_PRO` / `_AGENCY` | Monthly licensed prices |
| `STRIPE_PRICE_STARTER_ANNUAL` / `_PRO_ANNUAL` / `_AGENCY_ANNUAL` | Annual licensed prices |
| `STRIPE_PRICE_AI_OVERAGE` | Metered overage line item (1 unit = £0.01 billed) |

Checkout attaches the licensed price + overage metered item. Plan changes must preserve the overage item (`src/lib/stripe/subscription-items.ts`).

## Usage SQL (inform allowances)

```sql
SELECT kind, COUNT(*), SUM(cost_gbp), AVG(cost_gbp)
FROM agent_runs
WHERE created_at >= now() - interval '30 days'
GROUP BY kind ORDER BY SUM(cost_gbp) DESC;
```
