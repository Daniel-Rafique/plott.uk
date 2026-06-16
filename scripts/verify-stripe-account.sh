#!/usr/bin/env bash
# Compare the Stripe CLI session (stripe login) with STRIPE_SECRET_KEY from your
# env file so CLI commands and the app target the same Stripe account.
# The expected Dashboard account name contains "PLOTT" (see docs/stripe-new-account.md).
set -euo pipefail

# Must match the Plott Stripe Dashboard account (test may show "PLOTT sandbox").
EXPECTED_ACCOUNT_SUBSTR="PLOTT"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

load_stripe_secret_key() {
  local f line val
  for f in .env.local .env; do
    [ -f "$f" ] || continue
    line=$(grep -E '^[[:space:]]*STRIPE_SECRET_KEY=' "$f" 2>/dev/null | head -1) || true
    [ -n "$line" ] || continue
    val="${line#*STRIPE_SECRET_KEY=}"
    val="${val#\"}"
    val="${val%\"}"
    val="${val#\'}"
    val="${val%\'}"
    val="${val%%[[:space:]]*}"
    if [ -n "$val" ]; then
      printf '%s' "$val"
      return 0
    fi
  done
  return 1
}

account_id_for_key() {
  local key="$1"
  stripe get /v1/account --api-key "$key" 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'
}

echo "=== Stripe CLI (commands like: stripe prices update, stripe listen) ==="
if ! stripe whoami; then
  echo ""
  echo "Run: stripe login   (choose the account whose name includes $EXPECTED_ACCOUNT_SUBSTR)" >&2
  exit 1
fi
echo ""

CLI_LINE=$(stripe whoami 2>/dev/null | grep -E '^Account:' || true)
if [ -n "$CLI_LINE" ] && ! echo "$CLI_LINE" | grep -qi "$EXPECTED_ACCOUNT_SUBSTR"; then
  echo "Wrong Stripe account — CLI shows: $CLI_LINE" >&2
  echo "Re-run: stripe login   and select the PLOTT account (test: often \"PLOTT sandbox\")." >&2
  exit 1
fi
CLI_ACCT=$(echo "$CLI_LINE" | sed -n 's/.*(\(acct_[^)]*\)).*/\1/p')

KEY="${STRIPE_SECRET_KEY:-}"
if [ -z "$KEY" ]; then
  if KEY=$(load_stripe_secret_key); then
    echo "Loaded STRIPE_SECRET_KEY from project .env file for comparison."
  else
    echo "STRIPE_SECRET_KEY not set and not found in .env.local / .env."
    echo "Export it or add it to .env.local, then re-run this script to verify it matches the CLI."
    echo ""
    echo "To fix CLI account only:  stripe login"
    exit 0
  fi
else
  echo "Using STRIPE_SECRET_KEY from the environment for comparison."
fi
echo ""

echo "=== App / STRIPE_SECRET_KEY (Next.js, curl scripts, Vercel) ==="
if ! ENV_ACCT=$(account_id_for_key "$KEY" 2>/dev/null); then
  echo "Could not call Stripe with STRIPE_SECRET_KEY. Check the key and network." >&2
  exit 1
fi
echo "Account id: $ENV_ACCT"
echo ""

if [ -n "$CLI_ACCT" ] && [ "$CLI_ACCT" = "$ENV_ACCT" ]; then
  echo "OK — CLI and STRIPE_SECRET_KEY are the same PLOTT Stripe account ($CLI_ACCT)."
  exit 0
fi

if [ -z "$CLI_ACCT" ]; then
  echo "Could not parse account id from \`stripe whoami\` — compare the account names above manually."
  exit 1
fi

echo "MISMATCH — Stripe CLI: $CLI_ACCT  vs  STRIPE_SECRET_KEY: $ENV_ACCT"
echo ""
echo "Fix one of them:"
echo "  • Re-login the CLI:     stripe login"
echo "  • Or update .env with keys from: https://dashboard.stripe.com/apikeys (same test/live mode as the CLI)"
exit 1
