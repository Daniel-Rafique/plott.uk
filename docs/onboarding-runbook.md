# Onboarding & Auth Runbook

The onboarding funnel is `sign-up -> verify-email -> onboarding wizard -> subscribe -> Stripe checkout -> /app`. Most of that is handled in code, but a few things live in the **Neon Console** and **Resend**. Keep this page in sync whenever you change either service.

---

## 1. Neon Console — Auth settings

[console.neon.tech](https://console.neon.tech) -> your project -> **Auth** tab.

### 1a. Require email verification

**Configuration -> Email & password**

- `Require email verification`: **ON** (blocks sign-in until the user has verified their email).
- `Auto sign-in on sign-up`: **OFF** (we want a deliberate "check your inbox" step).
- `Verification method`: **Verification codes** (6-digit OTP). Do **not** use verification links — the app is OTP-only.

With "Require email verification" on, Neon Auth returns the session but refuses `get-session` until verification; our `src/lib/auth/onboarding-gate.ts` enforces the redirect to `/auth/verify-email`. The verify page auto-sends an OTP when the user arrives from sign-up (`?created=1`).

**Retesting the same email:** if you re-run signup without wiping, Neon may assign a new auth user id while an old `users` row still holds the same email (Prisma unique constraint). Always wipe before retesting:

```bash
npx tsx scripts/wipe-tenancy.ts --yes
```

See [section 4](#4-end-to-end-retest-from-a-clean-slate-including-after-a-stripe-account-migration) for production cautions.

### 1b. Webhook endpoint (branded email delivery)

**Configuration -> Webhooks -> Add webhook**

- URL: `https://planning-permission-app.vercel.app/api/auth/webhook`
- Events:
  - `send.otp`
  - `send.password_reset`
  - `send.magic_link`
  - `user.before_create` (optional; we use it to block disposable domains — currently a passthrough)
  - `user.created`

Our handler verifies the Ed25519 signature against `${NEON_AUTH_BASE_URL}/.well-known/jwks.json`, so as long as `NEON_AUTH_BASE_URL` is correct no extra JWKS configuration is needed.

Once the webhook is listening and returning `200 { handled: true }`, Neon Auth skips its own built-in email delivery.

### 1c. Project name (cosmetic fallback)

**Project settings -> Project name**: rename from the generated slug (e.g. `neon-citrine-globe`) to `Plott`. Only used if the webhook ever fails and Neon falls back to its default template.

---

## 2. Resend — branded transactional email

[resend.com](https://resend.com) -> **Domains**.

- Verify the domain you send from (e.g. `plott.uk`).
- Add SPF/DKIM/DMARC records in your DNS provider.
- Set `EMAIL_FROM` in Vercel to something like `Plott <hi@plott.uk>`.
- Set `RESEND_API_KEY` in Vercel (you likely already have this — we use it for letter sending).

Resend dashboard -> **Emails** shows delivery status; we log the Resend message ID from the webhook handler so you can cross-reference.

---

## 3. Environment variables

| Key | Where | Notes |
| --- | --- | --- |
| `NEON_AUTH_BASE_URL` | Vercel + `.env` | Existing. Base URL of the Neon Auth service. |
| `NEON_AUTH_COOKIE_SECRET` | Vercel + `.env` | Existing. 32+ char random. |
| `RESEND_API_KEY` | Vercel + `.env` | Existing. |
| `EMAIL_FROM` | Vercel + `.env` | **New.** Branded From header; must match a verified Resend domain. |
| `STRIPE_TRIAL_DAYS` | Vercel + `.env` | Set to **0** to disable intro trials. If unset, checkout defaults to **3**. |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_AGENCY` | Vercel + `.env` | Existing. |
| `STRIPE_PRICE_AI_OVERAGE` | Vercel + `.env` | Optional. Metered price for AI overage (see [stripe-pricing.md](./stripe-pricing.md)). |

Stripe CLI commands for plan **metadata** (budget, saved searches, overage rate) and **meter** setup are documented in [stripe-pricing.md](./stripe-pricing.md).

---

## 4. End-to-end retest from a clean slate (including after a Stripe account migration)

The `scripts/wipe-tenancy.ts` script nukes **every** app tenant row, **all** `users`, and **Neon Auth** tables (`neon_auth.user`, `session`, `account`, `verification`) so you can re-run the signup funnel with the same email.

**After switching to a new Stripe account**, existing rows still hold `Company.stripeCustomerId` and subscription fields pointing at the old account — checkout and webhooks will not line up. A full wipe is the supported fix before go-live (or in a staging DB you are resetting).

```bash
# dry run — prints the table counts it would clear
npx tsx scripts/wipe-tenancy.ts

# actually wipe
npx tsx scripts/wipe-tenancy.ts --yes

# also delete Plott-tagged customers in the Stripe account for the current STRIPE_SECRET_KEY
# (metadata.companyId set). Run with the *new* key so you only clean the new account.
npx tsx scripts/wipe-tenancy.ts --yes --stripe
```

**Production / `plott.uk`:** the script aborts if `NEXT_PUBLIC_APP_URL` looks like production, unless you set `WIPE_CONFIRM_PROD=1` for that single run. Point `DATABASE_URL` at the Neon branch you intend to clear (e.g. production) — there is no undo.

```bash
WIPE_CONFIRM_PROD=1 npx tsx scripts/wipe-tenancy.ts --yes --stripe
```

The script truncates the app-side tables (`memberships`, `companies`, `users`, `letters`, etc.) and clears `neon_auth.*`. It uses `DATABASE_URL` from `.env` / `.env.local` (same resolution as the updated script: `.env` first, then `.env.local` overrides).

After wiping, visit `/auth/sign-up` and complete signup + company + subscribe again. **Everyone** must re-register; there are no remaining user rows.

---

## 5. Onboarding stages (for debugging)

`src/lib/auth/onboarding-gate.ts` exposes `resolveStage()` which returns one of:

| Stage | Meaning | Redirect target |
| --- | --- | --- |
| `unauthenticated` | No Neon Auth session | `/auth/sign-in` |
| `unverified` | Session exists, `emailVerified=false` | `/auth/verify-email` |
| `needs_company` | Verified, but `Company.onboardingCompletedAt` is null | `/onboarding` |
| `needs_plan` | Company set up, but `Company.subscriptionStatus` not in (`trialing`, `active`) | `/subscribe` |
| `ready` | Trialing or active sub | `/app/dashboard` |

Every gated route redirects **forward** if the stage has already advanced, so back/forward navigation is idempotent.
