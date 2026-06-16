# AI evals (regression harness)

This document explains **what the AI eval system is**, **why it exists in the repo**, and **how to run it locally or in GitHub Actions**.

## Why it exists

Plott routes LLM calls through **Vercel AI Gateway** (`AI_GATEWAY_API_KEY`) with models chosen in `src/lib/ai/router.ts`. Small prompt or routing changes can silently shift behaviour (compliance judgments, ICP scoring, structured NL search output).

The eval harness **runs fixed test cases** from `src/lib/ai/evals/datasets.ts` through the **same runtime** as production (`runObject` in `src/lib/ai/runtime.ts`). It compares model output to expected outcomes and **fails the process** if any suite’s pass rate drops below a threshold (default **80%**). That gives a **weekly or on-demand regression signal** without manually clicking through the product.

It is **not** model training or offline evaluation datasets in the ML sense; it is **contract / smoke testing** for prompts and structured outputs.

## What runs

| Suite | Rough purpose |
|-------|----------------|
| `compliance` | UK sales-letter style checks (GDPR / PECR / CAP-style guardrails) |
| `icp_classifier` | ICP fit scoring from short firm descriptions |
| `nl_search` | Natural-language search queries parsed to structured fields |

Implementation: `src/lib/ai/evals/run.ts`. CLI entrypoint: `scripts/run-evals.ts` (`npm run evals`).

Each case still records **`AgentRun`** rows in Postgres (same as normal AI usage) so costs and traces can appear in admin / Langfuse when configured.

## `companyId` and `EVAL_COMPANY_ID`

The runtime is **multi-tenant**: calls need a real **`Company.id`** from your database so foreign keys (e.g. `AgentRun`) are valid. The eval **cases do not depend** on that company’s real letters or data.

- **Optional:** If you omit `--companyId` and **`EVAL_COMPANY_ID`** is unset or empty, the CLI loads **`DATABASE_URL`** and uses the **oldest** `Company` row (`ORDER BY created_at ASC`).
- **Optional (explicit):** Set **`EVAL_COMPANY_ID`** to a specific `companies.id` if you want all eval runs attributed to one tenant (e.g. staging). Find ids with Prisma Studio or `SELECT id, name FROM companies ORDER BY created_at ASC LIMIT 10;`.

Ids are **cuid**-style strings (see `prisma/schema.prisma`), not necessarily UUIDs.

## Local usage

Prerequisites: `.env` / `.env.local` with at least **`DATABASE_URL`** (DB that has ≥1 company) and **`AI_GATEWAY_API_KEY`**.

```bash
# Default: all suites, threshold 0.8, optional company
npm run evals

# Explicit tenant and threshold
npx tsx scripts/run-evals.ts --companyId <Company.id> --threshold 0.8

# Single suite
npx tsx scripts/run-evals.ts --suite compliance --threshold 0.8
```

Optional: `--report path/to/report.md` writes the Markdown report to a file.

## GitHub Actions

Workflow: **`.github/workflows/ai-evals.yml`**

- **Schedule:** Mondays 03:00 UTC.
- **Manual:** Actions → *AI evals* → *Run workflow* (threshold and optional suite).
- **Report:** Written under the runner temp dir, appended to the job **step summary**, and uploaded as artifact **`ai-eval-report`** when the file exists.

A step **fails fast** if `DATABASE_URL` or `AI_GATEWAY_API_KEY` is missing in the job (empty secrets).

### Subscription tier in CI

`runObject` **checks the company’s plan** before calling the model (`preflight` in `src/lib/ai/runtime.ts`). Tier comes from `getCompanyTier()` (`src/lib/ai/tiers.ts`): it maps `Company.subscriptionPriceId` to `starter` / `pro` / `agency` using **`STRIPE_PRICE_STARTER`**, **`STRIPE_PRICE_PRO`**, **`STRIPE_PRICE_AGENCY`**. If those env vars are missing (typical on GitHub runners), an active subscription with a real Stripe price id is treated as **unmapped → `free`**, and you get errors like *“requires the Pro plan (current: Free)”*.

The workflow sets **`AI_TIER_OVERRIDE=agency`** so evals can run every suite without copying Stripe price secrets into Actions. That variable is **only for regression runs** — do **not** set it on production Vercel.

If you hit the same errors **locally**, add e.g. `AI_TIER_OVERRIDE=agency` to `.env.local`, or align `STRIPE_PRICE_*` with the eval company’s `subscription_price_id`.

### Repository secrets

Create these under **Settings → Secrets and variables → Actions** (names must match exactly).

| Secret | Required | Maps to job env | Purpose |
|--------|----------|-----------------|--------|
| `EVAL_DATABASE_URL` | **Yes** | `DATABASE_URL` | Postgres URL for Prisma (same schema as app; needs ≥1 `Company` unless you set `EVAL_COMPANY_ID` to a valid id in that DB). |
| `AI_GATEWAY_API_KEY` | **Yes** | `AI_GATEWAY_API_KEY` | Gateway key for real model calls during evals. |
| `EVAL_COMPANY_ID` | No | `EVAL_COMPANY_ID` | Pin tenant id; if unset, oldest company is used. |
| Langfuse | No | — | The workflow sets **`LANGFUSE_DISABLE=true`** so eval runs do not call Langfuse (avoids 401 spam from wrong or placeholder keys). To trace evals in CI, remove that env line and add valid **`LANGFUSE_PUBLIC_KEY`**, **`LANGFUSE_SECRET_KEY`**, and optionally **`LANGFUSE_HOST`**. |

Use a **staging or dedicated** database if you do not want eval `AgentRun` noise on production.

### Setting secrets via API or CLI

GitHub’s API expects **Libsodium-encrypted** values. The easiest approach is the **GitHub CLI**:

```bash
gh secret set EVAL_DATABASE_URL --repo OWNER/REPO --body 'postgresql://...'
gh secret set AI_GATEWAY_API_KEY --repo OWNER/REPO --body '...'
```

REST API details: [Create or update a repository secret](https://docs.github.com/en/rest/actions/secrets#create-or-update-a-repository-secret).

## Related files

- `scripts/run-evals.ts` — CLI, argument parsing, company resolution, report.
- `src/lib/ai/evals/run.ts` — suite runners and aggregation.
- `src/lib/ai/evals/datasets.ts` — test cases.
- `src/lib/ai/nl-search-parse.ts` — shared NL→filter parser (evals import this, **not** `app/api/.../route.ts`, so the script never loads Neon Auth / cookie config).
- `.github/workflows/ai-evals.yml` — CI schedule and secrets wiring.
