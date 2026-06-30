# Onboarding & Auth Runbook

The onboarding funnel is `sign-up -> verify-email -> onboarding wizard -> subscribe -> Stripe checkout (14-day trial) -> /app`. Most of that is handled in code, but a few things live in the **Neon Console** and **Resend**. Keep this page in sync whenever you change either service.

---

## 1. Neon Console — Auth settings

[console.neon.tech](https://console.neon.tech) -> your project -> **Auth** tab.

### 1a. Require email verification

**Configuration -> Email & password**

- `Require email verification`: **ON** (blocks sign-in until the user has verified their email).
- `Auto sign-in on sign-up`: **OFF** (we want a deliberate "check your inbox" step).
- `Verification method`: **Verification codes** (6-digit OTP).

With "Require email verification" on, Neon Auth returns the session but refuses `get-session` until verification; our `src/lib/auth/onboarding-gate.ts` enforces the redirect to `/auth/verify-email`.

### 1b. Webhook endpoint (branded email delivery)

**Configuration -> Webhooks -> Add webhook**

- URL: `https://planning-permission-app.vercel.app/api/auth/webhook`
- Events:
  - `send.otp`
  - `send.password_reset`
  - `user.before_create` (optional; we use it to block disposable domains — currently a passthrough)
- Copy the signing key and set it as `NEON_AUTH_WEBHOOK_SIGNING_KEY` in Vercel (all envs).

Our handler verifies the Ed25519 signature against `${NEON_AUTH_BASE_URL}/.well-known/jwks.json`, so as long as `NEON_AUTH_BASE_URL` is correct no extra JWKS configuration is needed.

Once the webhook is listening and returning `200 { handled: true }`, Neon Auth skips its own built-in email delivery.

### 1c. Project name (cosmetic fallback)

**Project settings -> Project name**: rename from the generated slug (e.g. `neon-citrine-globe`) to `Plott`. Only used if the webhook ever fails and Neon falls back to its default template.

---

## 2. Resend — branded transactional email

[resend.com](https://resend.com) -> **Domains**.

- Verify the domain you send from (e.g. `plott.uk`).
- Add SPF/DKIM/DMARC records in your DNS provider.
- Set `EMAIL_FROM` in Vercel to something like `Plott <hello@plott.uk>`.
- Set `RESEND_API_KEY` in Vercel (you likely already have this — we use it for letter sending).

Resend dashboard -> **Emails** shows delivery status; we log the Resend message ID from the webhook handler so you can cross-reference.

---

## 3. Environment variables

| Key | Where | Notes |
| --- | --- | --- |
| `NEON_AUTH_BASE_URL` | Vercel + `.env` | Existing. Base URL of the Neon Auth service. |
| `NEON_AUTH_COOKIE_SECRET` | Vercel + `.env` | Existing. 32+ char random. |
| `NEON_AUTH_WEBHOOK_SIGNING_KEY` | Vercel + `.env` | **New.** Copied from the webhook config in the Neon Console. |
| `RESEND_API_KEY` | Vercel + `.env` | Existing. |
| `EMAIL_FROM` | Vercel + `.env` | **New.** Branded From header; must match a verified Resend domain. |
| `STRIPE_TRIAL_DAYS` | Vercel + `.env` | Defaults to 14 in `api/stripe/checkout`. |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_AGENCY` | Vercel + `.env` | Existing. |

---

## 4. End-to-end retest from a clean slate

The `scripts/wipe-tenancy.ts` script nukes every tenant/user row so you can re-run the signup funnel with the same email.

```bash
# dry run — prints the table counts it would clear
npx tsx scripts/wipe-tenancy.ts

# actually wipe (confirmation required)
npx tsx scripts/wipe-tenancy.ts --yes

# also delete Stripe customers created by the app
npx tsx scripts/wipe-tenancy.ts --yes --stripe
```

The script truncates the app-side tables (`memberships`, `companies`, `users`, `letters`, etc.) and `neon_auth.*` in a single transaction. It uses `DATABASE_URL` from the environment — **do not run against production** unless you mean it.

After wiping, you can visit `/auth/sign-up` with any email (even one you used before) and walk through the whole flow.

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
