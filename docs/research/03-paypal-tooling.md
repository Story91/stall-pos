# PayPal developer tooling inventory (2026-11-03)

Verified on npm today: `@paypal/agent-toolkit@1.11.0`, `@paypal/mcp@1.8.1`, `@paypal/paypal-server-sdk@2.5.0`.

## Sandbox basics

- Dashboard: https://developer.paypal.com/dashboard → Apps & Credentials → **Sandbox** → create app → `Client ID` + `Secret`.
- Sandbox accounts: Testing Tools → Sandbox Accounts. You get a default **Business** (merchant) and **Personal** (buyer) account. Create more buyers/sellers as needed (e.g. for Payouts recipients, marketplace sellers).
- API host: `https://api-m.sandbox.paypal.com` (prod: `https://api-m.paypal.com`).
- Token: `POST /v1/oauth2/token`, basic auth `CLIENT_ID:SECRET`, body `grant_type=client_credentials`. Sandbox tokens live 3–8 h.
- Idempotency: `PayPal-Request-Id` header on POSTs.
- Webhooks: Dashboard → app → Webhooks (needs public HTTPS URL → Render, or `ngrok`/`cloudflared` for local). Simulator exists in dashboard for firing test events.

## @paypal/agent-toolkit (TypeScript, Apache-2.0)

Import paths: `@paypal/agent-toolkit/ai-sdk` (Vercel AI SDK), `@paypal/agent-toolkit/openai`, `@paypal/agent-toolkit/langchain`, MCP via `@paypal/mcp`. Exports `PayPalAgentToolkit`, `PayPalWorkflows`, `ALL_TOOLS_ENABLED`.

```ts
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
const paypal = new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID!,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
  configuration: {
    actions: {
      orders: { create: true, get: true, capture: true },
      invoices: { create: true, list: true, send: true, sendReminder: true, cancel: true, generateQRC: true },
      products: { create: true, list: true },
      subscriptionPlans: { create: true, list: true, show: true },
      subscriptions: { create: true, show: true, cancel: true },
      disputes: { list: true, get: true },
      shipment: { create: true, show: true },
      transactions: { list: true },
    },
    context: { sandbox: true },
  },
});
// generateText({ model, tools: paypal.getTools(), maxSteps: 10, ... })
```

### 43 tools exposed

- **Invoices (20)**: create_invoice, list_invoices, get_invoice, send_invoice, send_invoice_reminder, cancel_sent_invoice, generate_invoice_qr_code, delete_invoice, generate_invoice_number, search_invoicing, update_invoicing, cancel_invoice_auto_reminder, record_payment_for_invoice, record_refund_for_invoice, create_conditional_rules_for_invoice, create_recurring_series, activate_recurring_series, get_recurring_series, cancel_recurring_series, delete_recurring_series
- **Payments (5)**: create_order, get_order, pay_order, create_refund, get_refund
- **Disputes (3)**: list_disputes, get_dispute, accept_dispute_claim
- **Shipment tracking (3)**: create_shipment_tracking, get_shipment_tracking, update_shipment_tracking
- **Catalog (3)**: create_product, list_products, show_product_details
- **Subscriptions (7)**: create_subscription_plan, list_subscription_plans, show_subscription_plan_details, create_subscription, show_subscription_details, update_subscription, cancel_subscription
- **Reporting (2)**: list_transactions, get_merchant_insights

**Not in the toolkit** (call REST directly or wrap as your own AI tool — this is a differentiator judges notice): **Payouts**, Webhooks, Marketplace/platform fees, Pay Later, Donations, Transaction Search details, Google Pay / UCP, ACP.

## MCP server

Remote: `https://mcp.paypal.com` (PayPal login, OAuth). Local:

```json
{ "mcpServers": { "paypal": {
  "command": "npx", "args": ["-y", "@paypal/mcp", "--tools=all"],
  "env": { "PAYPAL_ACCESS_TOKEN": "<token>", "PAYPAL_ENVIRONMENT": "SANDBOX" } } } }
```

## REST APIs that matter (sandbox-supported)

| API | Key endpoints | Use |
|---|---|---|
| Orders v2 | `POST /v2/checkout/orders`, `GET /{id}`, `PATCH /{id}`, `POST /{id}/confirm-payment-source`, `/authorize`, `/capture`, `/track` | buyer pays merchant; `intent: CAPTURE|AUTHORIZE`; `purchase_units[].payment_instruction.platform_fees` for marketplace split |
| Payments v2 | `POST /v2/payments/captures/{id}/refund`, `POST /v2/payments/authorizations/{id}/capture|void|reauthorize` | refunds, delayed capture (holds up to 3 days, reauth up to 29) |
| **Payouts v1** | `POST /v1/payments/payouts`, `GET /v1/payments/payouts/{batch_id}` | merchant → many people (EMAIL / PHONE / PAYPAL_ID / USER_HANDLE; `recipient_wallet: PayPal|Venmo`). Batch up to 15,000 items. 400 req/min. Sandbox test note `ERRPYO002` forces an error. |
| Invoicing v2 | `POST /v2/invoicing/invoices`, `/send`, `/remind`, `/payments`, `/generate-qr-code` | B2B / freelancers; recurring series |
| Subscriptions v1 | `POST /v1/catalogs/products`, `POST /v1/billing/plans`, `POST /v1/billing/subscriptions`, `/activate`, `/suspend`, `/cancel`, `/transactions` | recurring; trial periods; usage-based via `/v1/billing/subscriptions/{id}/revise` |
| Disputes v1 | `GET /v1/customer/disputes`, `/{id}`, `/provide-evidence`, `/accept-claim` | sandbox has a dispute simulator |
| Transaction Search | `GET /v1/reporting/transactions`, `/balances` | history for dashboards |
| Webhooks v1 | `POST /v1/notifications/webhooks`, `/verify-webhook-signature`, `/simulate-event` | event-driven agents; **always verify signature** |
| Add Tracking | `POST /v2/checkout/orders/{id}/track` | seller protection |
| Identity | `GET /v1/identity/oauth2/userinfo` + "Log in with PayPal" | know who the user is |

## JS SDK v6 (client side)

- New in 2026; `<script src="https://www.paypal.com/web-sdk/v6/core">` style, `paypal.createInstance({ clientToken })`, sessions for one-time payments (`createPayPalOneTimePaymentSession`) and subscriptions. Client token from server `POST /v1/oauth2/token` with `response_type=client_token`. React reference exists (`/sdk/react/reference`). Prefer v6 — resources page explicitly links it.

## Agentic Commerce (newest; mostly gated)

- **Agentic Commerce Services** (Oct 14 2026): Store Sync, Agent Ready — merchant onboarding via form at paypal.ai; **not self-serve → not for the hackathon build**, but cite in pitch.
- **Agent Ready → UCP with PayPal** (Google AI Mode/Gemini, config 2026-01-23): Google Pay token → `POST /v2/checkout/orders` with `payment_source.google_pay.token`. Requires Google UCP merchant registration → not usable in 9 days.
- **ACP for ChatGPT** via Braintree (Oct 29 2026): requires ChatGPT Apps SDK + Braintree. Skip.
- PYUSD / AP2 / x402: not in sandbox docs. Skip (mention as roadmap only).

**Conclusion:** the realistic 9-day stack is Orders v2 + Payouts + Subscriptions/Invoicing + Webhooks + Agent Toolkit/MCP, and the "agentic" story comes from *what the agent does with them*, not from gated protocols.

## Gotchas

- Sandbox buyer approval: for `create_order` you still need the buyer to approve (redirect `approve` link or JS SDK). For a demo video: log in with sandbox Personal account in a second browser profile.
- Payouts in sandbox: recipient emails do not need to exist, but to *see* the money land, use a sandbox Personal account email.
- Tokens expire; wrap PayPal calls in a client that refreshes.
- `PayPal-Request-Id` on every create; retries otherwise double-charge.
- Webhook signature verification needs `PAYPAL_WEBHOOK_ID`.
- Agent toolkit README config keys slightly mismatch tool names (products.update, shipment.cancel) — check `node_modules/@paypal/agent-toolkit` source.
