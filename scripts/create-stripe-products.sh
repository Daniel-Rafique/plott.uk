#!/usr/bin/env bash
# Create Plott products + prices in the currently-configured Stripe
# test account. Prints the three priceIds ready to paste into .env.local.
set -euo pipefail

if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo "STRIPE_SECRET_KEY not set" >&2
  exit 1
fi

create_product() {
  local name="$1"
  local desc="$2"
  curl -s "https://api.stripe.com/v1/products" \
    -u "$STRIPE_SECRET_KEY:" \
    -d "name=$name" \
    -d "description=$desc" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'
}

create_price() {
  local product="$1"
  local amount_pence="$2"
  local nickname="$3"
  curl -s "https://api.stripe.com/v1/prices" \
    -u "$STRIPE_SECRET_KEY:" \
    -d "product=$product" \
    -d "unit_amount=$amount_pence" \
    -d "currency=gbp" \
    -d "recurring[interval]=month" \
    -d "nickname=$nickname" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'
}

echo "Creating Starter product..."
STARTER_PROD=$(create_product "Plott Starter" "Sole traders: NL search + digest summaries")
STARTER_PRICE=$(create_price "$STARTER_PROD" 2900 "Starter / monthly")

echo "Creating Pro product..."
PRO_PROD=$(create_product "Plott Pro" "Growing contractors: Starter + letter assist + enrichment")
PRO_PRICE=$(create_price "$PRO_PROD" 7900 "Pro / monthly")

echo "Creating Agency product..."
AGENCY_PROD=$(create_product "Plott Agency" "Multi-office firms: Pro + autonomous outreach")
AGENCY_PRICE=$(create_price "$AGENCY_PROD" 19900 "Agency / monthly")

echo ""
echo "=== Paste these into .env.local (overwriting STRIPE_PRICE_*) ==="
echo "STRIPE_PRICE_STARTER=\"$STARTER_PRICE\""
echo "STRIPE_PRICE_PRO=\"$PRO_PRICE\""
echo "STRIPE_PRICE_AGENCY=\"$AGENCY_PRICE\""
echo "STRIPE_PRICE_ID=\"$PRO_PRICE\""
