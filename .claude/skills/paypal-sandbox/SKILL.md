---
name: paypal-sandbox
description: Use before writing or debugging any code that calls PayPal REST APIs (Orders v2, Payouts, Subscriptions, Invoicing, Disputes, Webhooks) in the sandbox. Covers auth, hosts, idempotency, test accounts, webhook verification, and the endpoints the Agent Toolkit does not wrap.
---

# PayPal sandbox integration

## Setup (once)

1. https://developer.paypal.com/dashboard → Apps & Credentials → **Sandbox** tab → Create App → copy Client ID and Secret into `.env` (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`).
2. Testing Tools → Sandbox Accounts: note the default Business (merchant) and Personal (buyer) logins. Create extra Personal accounts for payout recipients / circle members; use their emails in demo data.
3. App → Webhooks → add `https://<render-host>/api/paypal/webhook` and subscribe to the events you need. Copy Webhook ID → `PAYPAL_WEBHOOK_ID`. Locally use `cloudflared tunnel --url http://localhost:3000` or `ngrok`.
4. `node scripts/smoke-test.mjs` must pass before building anything on top.

## Client pattern (`lib/paypal/client.ts`)

```ts
const HOST = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
let cached: { token: string; exp: number } | null = null;

export async function token() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const r = await fetch(`${HOST}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64'),
               'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  const j = await r.json();
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

export async function pp<T>(method: string, path: string, body?: unknown, requestId?: string): Promise<T> {
  const r = await fetch(HOST + path, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json',
               ...(requestId ? { 'PayPal-Request-Id': requestId } : {}), Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new PayPalError(r.status, text);   // include debug_id from body in message
  return text ? JSON.parse(text) : (undefined as T);
}
```

Rules: amounts are strings with 2 decimals (`"12.50"`), currency uppercase ISO, `PayPal-Request-Id` (uuid) on every create, persist the PayPal id before returning to the caller, never retry a create without the same request id.

## Endpoints cheat sheet

### Orders v2 (buyer pays merchant)
- `POST /v2/checkout/orders` `{ intent: "CAPTURE", purchase_units: [{ reference_id, amount: { currency_code, value }, description, custom_id }], payment_source: { paypal: { experience_context: { return_url, cancel_url, user_action: "PAY_NOW" } } } }` → `id`, `links[rel=payer-action|approve]`.
- Buyer approves (redirect or JS SDK v6) → `POST /v2/checkout/orders/{id}/capture` → `purchase_units[0].payments.captures[0].id`.
- Refund: `POST /v2/payments/captures/{capture_id}/refund` `{ amount? }`.
- Marketplace split: `purchase_units[].payee.email_address` + `payment_instruction.platform_fees[{ amount }]` (needs partner enablement; fine to show in sandbox).

### Payouts v1 (merchant pays people) — **not in Agent Toolkit**
- `POST /v1/payments/payouts` `{ sender_batch_header: { sender_batch_id, email_subject, email_message }, items: [{ recipient_type: "EMAIL", receiver, amount: { value, currency }, note, sender_item_id, recipient_wallet: "PAYPAL" }] }` → `batch_header.payout_batch_id`.
- `GET /v1/payments/payouts/{batch_id}` → `items[].transaction_status` (SUCCESS, PENDING, UNCLAIMED, FAILED...).
- Sandbox: receiver may be any email; use a sandbox Personal account email to show the balance change. Note `ERRPYO002` forces a failure for testing.
- Limits: 400 POST/min; up to 15,000 items per batch. Batch is async; poll or use webhooks `PAYMENT.PAYOUTSBATCH.SUCCESS`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED|FAILED|UNCLAIMED`.

### Subscriptions v1
- Product: `POST /v1/catalogs/products` `{ name, type: "SERVICE" }`.
- Plan: `POST /v1/billing/plans` `{ product_id, name, billing_cycles: [{ frequency: { interval_unit: "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value, currency_code } } }], payment_preferences: { auto_bill_outstanding: true } }`.
- Subscription: `POST /v1/billing/subscriptions` `{ plan_id, subscriber: { email_address }, application_context: { return_url, cancel_url, user_action: "SUBSCRIBE_NOW" } }` → approve link → webhook `BILLING.SUBSCRIPTION.ACTIVATED`, `PAYMENT.SALE.COMPLETED`.
- Manage: `/activate`, `/suspend`, `/cancel`, `/revise`, `GET /{id}/transactions?start_time&end_time`.

### Invoicing v2
- `POST /v2/invoicing/invoices` → `POST /v2/invoicing/invoices/{id}/send` → `GET`; `POST /{id}/remind`; `POST /{id}/payments` (record external payment); `POST /{id}/generate-qr-code`.

### Disputes v1
- `GET /v1/customer/disputes`, `GET /{id}`, `POST /{id}/provide-evidence`, `POST /{id}/accept-claim`. Sandbox has a dispute simulator in Testing Tools.

### Transactions
- `GET /v1/reporting/transactions?start_date&end_date&fields=all` (ISO timestamps, max 31-day window), `GET /v1/reporting/balances`.

### Webhooks
- Verify: `POST /v1/notifications/verify-webhook-signature` with `{ auth_algo, cert_url, transmission_id, transmission_sig, transmission_time, webhook_id, webhook_event }` from headers `PAYPAL-AUTH-ALGO`, `PAYPAL-CERT-URL`, `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-SIG`, `PAYPAL-TRANSMISSION-TIME`. Act only on `verification_status === "SUCCESS"`.
- Simulate: Dashboard → Webhooks simulator, or `POST /v1/notifications/simulate-event`.
- Idempotent handlers: store `event.id`, skip duplicates.

### JS SDK v6 (client)
- Server: `POST /v1/oauth2/token` with `response_type=client_token` (+ `intent=sdk_init`) → `client_token` (short-lived).
- Client: load `https://www.paypal.com/web-sdk/v6/core`, `const sdk = await window.paypal.createInstance({ clientToken, components: ["paypal-payments"] })`, `sdk.createPayPalOneTimePaymentSession({ onApprove })` → `session.start({ presentationMode: "auto" }, createOrderOnServer())`. Prefer v6 over the legacy `checkout.js`/`sdk/js` since the resources page highlights v6.

## Sandbox gotchas

- Sandbox API is slow (1–3 s) and occasionally 5xx; wrap with 3 retries + jitter for GETs only.
- Approve flows need a buyer login: keep a second browser profile logged into the sandbox Personal account for the video.
- Payout funds come from the Business account balance; sandbox gives $5,000+ by default. If a payout is `PENDING` forever, the recipient email is not a sandbox account; use one that is.
- Currency: keep everything USD in the demo.
- `debug_id` in error bodies is what PayPal support / Discord will ask for.
