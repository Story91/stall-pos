# Day-0 spike findings (sandbox, 2026-11-04 00:05 Warsaw)

Status: **complete** (2026-11-04 00:50 Warsaw). Invoice create/send/QR, customer payment, and Payout all verified against the sandbox.

## Setup facts

- Sandbox Business account (US): `sb-7dvsg53656715@business.example.com`, balance USD 5,000.
- REST app in use: **stall-pos** (second app). The first app, "Stall", was created with Invoicing disabled; enabling it later does not change the scopes of the already-issued (cached, ~9 h) client token, so a fresh app with Invoicing + Transaction search enabled *before* the first token was the fastest fix. Lesson for the README: enable **Invoicing, Payouts, Transaction search, Customer disputes** in the app features before requesting the first token.
- Three Personal US accounts created: buyer `sb-fdfde53702808@personal.example.com`, Maria `sb-rukiy53702809@personal.example.com`, Rosa `sb-g0any53702812@personal.example.com`. Passwords live in `.env` only.
- Token: `expires_in` 32400 s (9 h); scopes include `invoicing`, `payments/payouts`, `reporting`.

## Measured

| Step | Result |
|---|---|
| `POST /v2/invoicing/invoices` | 201, ~1–2 s; returns `href`, id `INV2-…` |
| `POST …/send` `{ send_to_recipient: false, send_to_invoicer: false }` | 200; invoice `UNPAID`; `detail.metadata.recipient_view_url` = `https://www.sandbox.paypal.com/invoice/p/#<id-without-dashes>` |
| `POST …/generate-qr-code` `{ width, height, action: 'pay' }` | **200 with `Content-Type: multipart/form-data; boundary=<uuid>`**, one part `name="image"`, `Content-Type: text/plain`, body = base64 PNG. **Not** JSON, **not** a bare base64 string. Parsing: take the text after the part's blank line up to the next `\r\n--`. ~950 bytes for 400×400. |
| Pay → `PAID` | **Verified 2026-11-04 ~00:45 Warsaw.** Buyer opened the pay link, logged in with the sandbox Personal account, saw PayPal balance and a saved card as options, paid 9.00 USD. Invoice `status: PAID`; `payments.transactions[0] = { type: 'PAYPAL', method: 'PAYPAL', transaction_status: 'SUCCESS', payment_date: 'YYYY-MM-DD', payment_date_time: ISO }`. **Field is `payment_date_time`, not `date`** (webhook handler must read it). Latency from "Pay" to API `PAID` not timed precisely; the poll saw it on the first check after payment. |
| Payout → recipient | **Verified.** `POST /v1/payments/payouts` 1.00 USD to Maria's sandbox account: batch `PENDING` at t+0, `PROCESSING` t+6 s, item `SUCCESS` t+12 s, batch `SUCCESS` t+18 s. Fee **0.25 USD per item** in sandbox (US Payouts pricing) — mention in README; the demo's $120 payout costs $0.25. PayPal batch id (`GLACPA5F5UD9W`) ≠ our sender batch id — stored separately (Task 13). |
| `/v1/reporting/balances` | Shows 5000.00 right after the sale; reporting lags. Do not use it in the video; show invoice status or the transaction list. |

## Consequences for the code

- `stall/src/lib/paypal/invoices.ts` `generateQr` assumed a bare base64 body: it must parse the multipart part. Carried into Task 13's dispatch (same `lib/paypal` area), with a fixture from `scratch/qr-body.txt`.
- The pay link opens on PayPal's sandbox domain; the customer can pay with the sandbox Personal account. Guest card payment visibility on mobile is still to be observed.
- Polling interval: keep 3 s (payment showed as PAID within one poll after the buyer paid).
- Webhook handler (Task 9) reads `transactions[0].date`; real field is `payment_date_time` → fix carried into Task 17.
- Payouts settle in ~18 s in sandbox; the Close screen should poll or rely on the PAYMENT.PAYOUTS-ITEM.SUCCEEDED webhook rather than expecting instant SUCCESS.

## Addendum 2026-11-04 (final fix wave)

- PayPal computes invoice tax **per line** and rounds each line, so a sale with several taxable lines can differ from a single rounded total by a cent (verified: 2× carnitas $4.50 + 2× barbacoa $4.75 + 1× elote $4.00 at 8.25% → our 186¢ tax, PayPal 185¢; invoice total $24.35 vs our $24.36). Stall now stores PayPal's invoice total as authoritative and logs the adjustment.
- `sender_item_id` is limited to 63 characters and `sender_batch_id` to 30; Stall uses 30-char deterministic ids (`st-{s|b}-<25 hex>`).
- The QR endpoint rejects `Accept: application/json` with 406; send `Accept: */*`.
- Payouts to an email that is not a sandbox account land `UNCLAIMED`; seed payees must use the sandbox Personal account emails (`SANDBOX_MARIA_EMAIL`, `SANDBOX_ROSA_EMAIL`).
