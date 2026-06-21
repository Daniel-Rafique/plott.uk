# New Stripe account (test or production)

**Plott’s Stripe account** in the Dashboard is named **PLOTT** (e.g. test mode may show as “PLOTT sandbox”). Use that account for API keys, CLI login (`stripe login`), and products — not a personal or unrelated business.

Use this doc when creating a **new** Stripe account or switching Plott to different API keys. Product and price IDs (`price_*`, `prod_*`) are **not portable** between accounts — recreate catalog items and update environment variables.

**Check CLI + `.env` match:** from the repo root run `npm run stripe:verify` (or `bash scripts/verify-stripe-account.sh`).

**Check price ids + metadata** (AI budget, saved-search limits, overage multiplier): `npx tsx scripts/ensure-stripe-prices.ts` — add `--fix` to apply the values from [stripe-pricing.md](./stripe-pricing.md).

## 1. API keys

In [Dashboard → Developers → API keys](https://dashboard.stripe.com/apikeys), copy:

| Env variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | Secret key (`sk_test_...` or `sk_live_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Publishable key (`pk_test_...` or `pk_live_...`) |

Test and live keys are different; keep each deployment on one mode only.

## 2. Products and prices

1. **Create catalog + metadata (recommended):** `npm run stripe:create-products` (requires `STRIPE_SECRET_KEY`). It creates the three Plott products, monthly **GBP** prices (£29 / £79 / £199), and sets Price metadata. Copy the output into `.env.local`.
2. **Or** create three monthly subscription prices manually in the Dashboard and set env vars to the new `price_...` IDs; then `npm run stripe:ensure-prices -- --fix` to align metadata.
3. Set these env vars to the new `price_...` IDs (printed by `create-products` or copied from the Dashboard):

| Env variable |
| --- |
| `STRIPE_PRICE_STARTER` |
| `STRIPE_PRICE_PRO` |
| `STRIPE_PRICE_AGENCY` |

4. Price [metadata](./stripe-pricing.md) is set automatically by `create-products` / `npm run stripe:ensure-prices -- --fix`. For manual CLI updates, see [README](../README.md) and [stripe-pricing.md](./stripe-pricing.md).

5. Optional: AI overage meter + metered price → `STRIPE_PRICE_AI_OVERAGE` (see [stripe-pricing.md](./stripe-pricing.md)).

## 3. Webhook endpoint

1. [Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks) → **Add endpoint**.
2. **Endpoint URL:** `https://<your-host>/api/webhooks/stripe`  
   - Local: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and use the CLI signing secret.
3. **Events to send** — the handler in `src/app/api/webhooks/stripe/route.ts` uses only these (you may select the exact list or wider wildcards):

   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.trial_will_end`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

4. Copy the endpoint **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

If checkout completes but the app stays on **“Activating your subscription”**, the `checkout.session.completed` webhook is not applying (wrong URL, wrong `STRIPE_WEBHOOK_SECRET`, or delivery delay). The subscribe success page also calls **`POST /api/stripe/sync-checkout`** with the `session_id` from the return URL to reconcile the database from the Checkout Session, so you unstick without waiting for Stripe. Fix the webhook for production long-term.

For Klaviyo billing lifecycle automation, add a **second** Stripe webhook endpoint using `KLAVIYO_WEBHOOK_URL`. Do not replace the Plott app webhook above. See [klaviyo-stripe.md](./klaviyo-stripe.md).

## 4. Other env vars (optional)

| Variable | Purpose |
| --- | --- |
| `STRIPE_AUTOMATIC_TAX` | Set to `true` if [Stripe Tax](https://stripe.com/tax) is enabled ([checkout](../src/app/api/stripe/checkout/route.ts)). |
| `STRIPE_TRIAL_DAYS` | Trial length for new subscriptions; default **14** if unset. |
| `NEXT_PUBLIC_APP_URL` | Must match the site URL used for Checkout success/cancel redirects. |

## 5. App-set metadata (do not set manually in Dashboard for normal flow)

Checkout creates **Customer** and **Subscription** metadata (`companyId`, `userId`) and sets `client_reference_id` to the company id. The webhook uses these to link Stripe to `Company` rows. See `ensureCustomerId` and `checkout.sessions.create` in `src/app/api/stripe/checkout/route.ts`.

## 6. Database and customer IDs

`Company.stripeCustomerId` and `subscriptionPriceId` point at objects in **one** Stripe account. After switching keys, old IDs are invalid. To **reset every user and company** (e.g. after migrating Stripe), use `scripts/wipe-tenancy.ts` — see [§4 in onboarding-runbook.md](./onboarding-runbook.md#4-end-to-end-retest-from-a-clean-slate-including-after-a-stripe-account-migration). For a **single** company, `scripts/reset-stripe-customer.ts` can clear the Stripe id on that row.

## 7. Vercel: “The selected plan price isn’t available in Stripe”

Stripe returns **no such price** for the `price_` in checkout — almost always a **test vs live** mismatch, or `STRIPE_PRICE_*` from a different account than `STRIPE_SECRET_KEY`.

| `STRIPE_SECRET_KEY` | `STRIPE_PRICE_*` must come from |
| --- | --- |
| `sk_test_...` | Dashboard with **Test mode** on (test catalogue only) |
| `sk_live_...` | Dashboard with **Test mode** off (**Live** `price_...` only) |

`npm run stripe:create-products` with a **test** key only creates **test** prices. If Vercel uses **`sk_live_`**, create the same three products/prices in **Live** in Stripe and set those live `STRIPE_PRICE_*` in Vercel (test price ids will never work with a live key).

Checklist:

1. Production env on Vercel has `STRIPE_SECRET_KEY` + all `STRIPE_PRICE_*` in the **same** test/live mode.
2. **Redeploy** after env changes.
3. No stray spaces in `price_...` values.

The checkout response includes a **hint** field when this error is returned (see [checkout route](../src/app/api/stripe/checkout/route.ts)).

**Only the Agency tier fails, Starter/Pro work:** Vercel often has **separate** env rows per variable. It is common to add `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_PRO` for both Preview and Production, but leave **`STRIPE_PRICE_AGENCY`** on an old value or **Production-only** while you test on a **Preview** deployment — then Agency breaks on Preview, or still points at a stale `price_...` on Production. In Vercel → Environment Variables, search `STRIPE_PRICE`, confirm there is **exactly one** `STRIPE_PRICE_AGENCY` per environment you use, with the current Dashboard id, then **Redeploy**.

## Related

- [stripe-pricing.md](./stripe-pricing.md) — price metadata, AI meter, CLI examples  
- [README — Stripe setup](../README.md#stripe-setup)
