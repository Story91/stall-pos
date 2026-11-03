# Day-0 spike findings (sandbox, 2026-11-04 00:05 Warsaw)

Status: **partial**. Invoice create/send/QR verified from this machine; the customer-side payment and the Payout are pending a human paying the invoice with the sandbox buyer account.

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
| Pay → `PAID` latency | pending (needs buyer login) |
| Payout → recipient balance | pending |

## Consequences for the code

- `stall/src/lib/paypal/invoices.ts` `generateQr` assumed a bare base64 body: it must parse the multipart part. Carried into Task 13's dispatch (same `lib/paypal` area), with a fixture from `scratch/qr-body.txt`.
- The pay link opens on PayPal's sandbox domain; the customer can pay with the sandbox Personal account. Guest card payment visibility on mobile is still to be observed.
- Polling interval 3 s stays until the pay latency is measured.
