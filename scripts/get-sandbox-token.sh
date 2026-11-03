#!/usr/bin/env bash
# Prints a sandbox access token and writes it to .env as PAYPAL_ACCESS_TOKEN. Requires curl + jq.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo ".env not found; copy .env.example"; exit 1; }
set -a; source .env; set +a
: "${PAYPAL_CLIENT_ID:?}" "${PAYPAL_CLIENT_SECRET:?}"
TOKEN=$(curl -s https://api-m.sandbox.paypal.com/v1/oauth2/token -u "$PAYPAL_CLIENT_ID:$PAYPAL_CLIENT_SECRET" -d grant_type=client_credentials | jq -r .access_token)
if grep -q '^PAYPAL_ACCESS_TOKEN=' .env; then
  sed -i.bak "s|^PAYPAL_ACCESS_TOKEN=.*|PAYPAL_ACCESS_TOKEN=$TOKEN|" .env && rm -f .env.bak
else
  printf '\nPAYPAL_ACCESS_TOKEN=%s\n' "$TOKEN" >> .env
fi
echo "Token written to .env (${TOKEN:0:12}...)"
