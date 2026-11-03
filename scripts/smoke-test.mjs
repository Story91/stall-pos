#!/usr/bin/env node
// Sandbox smoke test: token → create order → read it back → list recent transactions.
// Usage: node scripts/smoke-test.mjs   (reads .env in repo root; no dependencies)
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const HOST = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing in .env');

const step = (name) => console.log(`\n▶ ${name}`);
const ok = (msg) => console.log(`  ✔ ${msg}`);

step('1. OAuth client_credentials');
const tokRes = await fetch(`${HOST}/v1/oauth2/token`, {
  method: 'POST',
  headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
});
if (!tokRes.ok) throw new Error(`token ${tokRes.status}: ${await tokRes.text()}`);
const { access_token, expires_in, app_id } = await tokRes.json();
ok(`token for app ${app_id}, expires in ${expires_in}s`);

const pp = async (method, path, body, requestId) => {
  const r = await fetch(HOST + path, {
    method,
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
};

step('2. Create order (CAPTURE, 1.00 USD)');
const order = await pp('POST', '/v2/checkout/orders', {
  intent: 'CAPTURE',
  purchase_units: [{ reference_id: 'smoke', amount: { currency_code: 'USD', value: '1.00' }, description: 'Smoke test order' }],
  payment_source: { paypal: { experience_context: { return_url: 'https://example.com/return', cancel_url: 'https://example.com/cancel', user_action: 'PAY_NOW' } } },
}, randomUUID());
const approve = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
ok(`order ${order.id} status ${order.status}`);
if (approve) console.log(`  → buyer approval URL: ${approve}`);

step('3. Read order back');
const fetched = await pp('GET', `/v2/checkout/orders/${order.id}`);
ok(`status ${fetched.status}, amount ${fetched.purchase_units[0].amount.value} ${fetched.purchase_units[0].amount.currency_code}`);

step('4. List transactions (last 7 days)');
const end = new Date();
const start = new Date(end.getTime() - 7 * 864e5);
const tx = await pp('GET', `/v1/reporting/transactions?start_date=${start.toISOString()}&end_date=${end.toISOString()}&fields=all&page_size=5`);
ok(`${tx.total_items ?? tx.transaction_details?.length ?? 0} transactions in window`);

step('5. Balances');
const bal = await pp('GET', '/v1/reporting/balances');
ok(`${bal.balances?.map((b) => `${b.currency}: ${b.total_balance?.value}`).join(', ') || 'no balances returned'}`);

console.log('\nSandbox OK. Payouts/Subscriptions are exercised by the app tests, not here.');
