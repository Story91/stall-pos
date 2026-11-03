---
name: paypal-agent-toolkit
description: Use when wiring an LLM agent to PayPal via @paypal/agent-toolkit (Vercel AI SDK / OpenAI / LangChain adapters) or the @paypal/mcp server, when deciding which of the 43 built-in tools to enable, or when adding custom PayPal tools the toolkit lacks (Payouts, webhooks, platform fees).
---

# PayPal Agent Toolkit + MCP

Versions verified 2026-11-03: `@paypal/agent-toolkit@1.11.0`, `@paypal/mcp@1.8.1`.

## Vercel AI SDK wiring

```ts
import { generateText } from 'ai';
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
import { payoutTools } from '@/lib/agent/tools/payouts';   // our own, see below

const paypal = new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID!,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
  configuration: {
    actions: {
      orders: { create: true, get: true, capture: true },
      subscriptionPlans: { create: true, list: true, show: true },
      subscriptions: { create: true, show: true, cancel: true },
      invoices: { create: true, send: true, list: true },
      transactions: { list: true },
    },
    context: { sandbox: true },
  },
});

const result = await generateText({
  model: 'anthropic/claude-sonnet-5-5',
  system: SYSTEM_PROMPT,            // includes hard rules: never exceed limits, always explain
  tools: { ...paypal.getTools(), ...payoutTools },
  maxSteps: 10,
  prompt,
});
```

Enable only the tools the product needs; a smaller tool surface = fewer wrong calls and a cleaner story for judges ("the agent can create orders and pay out, nothing else").

## The 43 built-in tools (by group)

Invoices (20): create_invoice, list_invoices, get_invoice, send_invoice, send_invoice_reminder, cancel_sent_invoice, generate_invoice_qr_code, delete_invoice, generate_invoice_number, search_invoicing, update_invoicing, cancel_invoice_auto_reminder, record_payment_for_invoice, record_refund_for_invoice, create_conditional_rules_for_invoice, create_recurring_series, activate_recurring_series, get_recurring_series, cancel_recurring_series, delete_recurring_series.
Payments (5): create_order, get_order, pay_order, create_refund, get_refund.
Disputes (3): list_disputes, get_dispute, accept_dispute_claim.
Shipment (3): create_shipment_tracking, get_shipment_tracking, update_shipment_tracking.
Catalog (3): create_product, list_products, show_product_details.
Subscriptions (7): create_subscription_plan, list_subscription_plans, show_subscription_plan_details, create_subscription, show_subscription_details, update_subscription, cancel_subscription.
Reporting (2): list_transactions, get_merchant_insights.

Missing (write your own with `tool()` from `ai` + zod): **Payouts**, webhooks, refunds by capture id, platform fees, balances, identity.

## Custom tool template

```ts
import { tool } from 'ai';
import { z } from 'zod';
import { createPayout } from '@/lib/paypal/payouts';
import { enforceSpend } from '@/lib/policy/spend';

export const payoutTools = {
  paypal_payout: tool({
    description: 'Send money from the merchant account to a person by email. Use only after the task is verified. Amount in USD.',
    inputSchema: z.object({
      receiverEmail: z.string().email(),
      amount: z.string().regex(/^\d+\.\d{2}$/),
      note: z.string().max(140),
      referenceId: z.string(),
    }),
    execute: async (input, { toolCallId }) => {
      await enforceSpend(input.amount);                         // hard limits live in code
      const batch = await createPayout({ ...input, senderBatchId: toolCallId });
      return { payoutBatchId: batch.batch_header.payout_batch_id, status: batch.batch_header.batch_status };
    },
  }),
};
```

Return small, structured results; the model reasons better over `{ status, id, amount }` than over raw PayPal JSON.

## MCP server (for Claude Desktop / Cursor demos)

`.mcp.json` in this repo starts PayPal's official server locally:

```json
{ "mcpServers": { "paypal": { "command": "npx", "args": ["-y", "@paypal/mcp", "--tools=all"],
  "env": { "PAYPAL_ACCESS_TOKEN": "${PAYPAL_ACCESS_TOKEN}", "PAYPAL_ENVIRONMENT": "SANDBOX" } } } }
```

Get a token with `scripts/get-sandbox-token.ps1` (expires in 3–8 h; regenerate before recording). Remote alternative: https://mcp.paypal.com (PayPal login).

If our product exposes its own MCP server (e.g. `hire_human`), register both in Claude Desktop and show them side by side in the video: "PayPal's MCP + ours".

## Prompting rules for money-moving agents

- System prompt states: amounts/limits, when to ask the human, what to never do.
- Limits are enforced in `execute`, not in the prompt. The prompt is UX; the code is the guardrail.
- Ask the model to output a one-sentence rationale before each money tool call; store it; show it in the UI (judges love visible reasoning).
- Use `maxSteps` ≤ 10 and a per-run spend cap; abort on cap.
- Log every tool call (input, output, latency) to the DB; the AG Grid ledger reads from there.
