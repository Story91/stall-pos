#!/usr/bin/env node
// Sandbox smoke test: token → create invoice → send + QR → list recent transactions → balances.
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

step('2. Create draft invoice (1 item, USD)');
const invoice = await pp('POST', '/v2/invoicing/invoices', {
  detail: { currency_code: 'USD', invoice_number: `SMOKE-${Date.now()}`, note: 'Stall smoke test' },
  items: [{ name: 'Taco al pastor', quantity: '2', unit_amount: { currency_code: 'USD', value: '4.50' }, unit_of_measure: 'QUANTITY' }],
}, randomUUID());
const invoiceId = invoice.id ?? invoice.href?.split('/').pop();
ok(`invoice ${invoiceId} created`);

step('3. Send invoice and generate QR');
await pp('POST', `/v2/invoicing/invoices/${invoiceId}/send`, { send_to_recipient: false, send_to_invoicer: false });
const sent = await pp('GET', `/v2/invoicing/invoices/${invoiceId}`);
const payLink = sent.detail?.metadata?.recipient_view_url;
ok(`status ${sent.status}, total ${sent.amount?.value} ${sent.amount?.currency_code}`);
if (payLink) console.log(`  → customer pay link: ${payLink}`);
const qrRes = await fetch(`${HOST}/v2/invoicing/invoices/${invoiceId}/generate-qr-code`, { method: "POST", headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ width: 300, height: 300, action: "pay" }) });
const qrRaw = await qrRes.text();
// PayPal answers multipart/form-data with one part name="image" whose body is base64 PNG.
const qrMatch = qrRaw.match(/name="image"[\s\S]*?\r?\n\r?\n([\s\S]*?)\r?\n--/);
const qr = qrMatch ? qrMatch[1].trim() : qrRaw.replace(/^"|"$/g, "");
ok(`QR code received (${qr.length} chars base64, content-type ${qrRes.headers.get("content-type")})`);

step('4. List transactions (last 7 days)');
const end = new Date();
const start = new Date(end.getTime() - 7 * 864e5);
const tx = await pp('GET', `/v1/reporting/transactions?start_date=${start.toISOString()}&end_date=${end.toISOString()}&fields=all&page_size=5`);
ok(`${tx.total_items ?? tx.transaction_details?.length ?? 0} transactions in window`);

step('5. Balances');
const bal = await pp('GET', '/v1/reporting/balances');
ok(`${bal.balances?.map((b) => `${b.currency}: ${b.total_balance?.value}`).join(', ') || 'no balances returned'}`);

console.log('\nSandbox OK. Payouts and webhooks are exercised by the app tests, not here.');
console.log('If the invoice currency or tax display looks wrong, check that the sandbox Business account country is United States.');
