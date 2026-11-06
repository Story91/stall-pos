# Devpost submission draft (PayPal AI Hackathon 2026)

Copy each block into the matching Devpost field. Everything here was verified against the live sandbox on Nov 4, 2026.

---

## Project name

Stall

## Elevator pitch (tagline)

Sell and settle by talking. A voice-first point of sale that turns a spoken order into a PayPal invoice with a QR code, then closes the day with an AI agent that pays your helpers through PayPal Payouts and stops to ask when a bill looks wrong.

## Links

- Hosted demo: https://stall-ashen.vercel.app (owner PIN `1234`, PayPal sandbox only)
- Code: https://github.com/Story91/stall-pos (MIT)
- Video: <YOUTUBE_URL>

## Built with

`ag-grid` `paypal` `paypal-invoicing` `paypal-payouts` `paypal-webhooks` `claude` `vercel-ai-sdk` `next.js` `typescript` `react` `vercel` `neon` `postgresql` `drizzle` `tailwindcss` `web-speech-api` `vitest` `playwright`

---

## Inspiration

Walk past any food truck or market stall and you see the same setup: a cash box, a notebook, and a sticker with a payment handle. Customers carry less cash every year, but a full point-of-sale system means building a menu grid, tapping through screens with busy hands, and doing it all in English. Then the day ends and the owner still has to work out who is owed what: the helper who worked the shift, the supplier who dropped off tortillas.

We wanted a tool for that owner, for both halves of the day: selling, and settling up afterwards. And we wanted it to work in whatever language the owner already speaks.

The numbers back it up. New York City alone has about 23,000 street vendors, 96% of them immigrants and 55% with little or no English (Brooklyn Reader, on an Immigration Research Initiative report). Cash fell to 14% of US payments in 2024 (Federal Reserve Diary of Consumer Payment Choice), and 9.5% of Hispanic households have no bank account (FDIC 2023). Sources are linked in the README.

## What it does

**Sell by talking.** The owner holds the mic and says the order in English, Spanish or Polish, for example "dos tacos al pastor y un agua fresca". Claude turns the transcript into line items using the business's own catalog and prices. The owner checks the ticket, adds a tip if any, and taps **Charge**.

**Get paid with a QR code.** Stall creates and sends an itemized **PayPal invoice** with sales tax per line, then shows PayPal's QR code and pay link. The customer pays on PayPal's page with PayPal, a debit or credit card, or Apple Pay, with no app needed. When PayPal reports the invoice paid, the phone flips to a full-screen **Paid** and says it out loud in the sale's language. Cash sales are recorded on the same invoice with one tap.

**Log what you owe.** During the day the owner taps who worked ("Maria worked today") and logs bills by voice ("I owe Rosa 240 for tortillas").

**Close the day.** One button runs the close. Code rules decide what may be paid: daily limits per person, a cap for the whole business, a check for bills that look like one already paid, and earlier failed payouts. An AI agent then works through the day with three tools (pay, hold, write a note). Payable items go out through **PayPal Payouts**. Anything suspicious becomes a decision card instead. In the demo, Maria's $120 shift is paid automatically, while the $240 tortilla bill is held because a $240 tortilla bill was already paid two days earlier, with both bills shown side by side. The owner can approve, decline, or mark it as already paid. Running the close again pays nothing twice.

**See the day.** The Day screen shows sales, tax, tips, cash versus PayPal, and every payout's status as PayPal reports it.

**Ask your history.** The History screen is one ledger of sales and payouts on **AG Grid**, with filters, search, a totals row and CSV export. The owner can also just ask, by voice or text: "cash sales over $20 this week", "¿cuánto le pagué a Maria?". Claude turns the question into a filter for the grid, and the answer line (how many sales, and their total) is computed by code from the rows it shows, never by the model.

**In the owner's language.** English, Spanish or Polish switches every screen, the close summary and the voice.

## How we built it

- **Next.js 16 (App Router) and TypeScript** in one app, deployed on **Vercel**. A Vercel Cron job runs the nightly close.
- **PayPal REST APIs in the sandbox:** Invoicing v2 (create, send, QR code, record cash payment, status), Payouts v1 (batch create and status), and Webhooks (`INVOICING.INVOICE.PAID`, `PAYMENT.PAYOUTS-ITEM.*`) with signature verification. Every POST carries a `PayPal-Request-Id`, and every response is validated with zod.
- **Claude through the Vercel AI SDK:** structured output for parsing spoken orders and owed amounts, and a tool-calling agent for the close.
- **Code-enforced money rules.** A pure rules engine computes pay, hold or skip for every obligation before the model runs. The agent's pay tool refuses anything the rules did not mark payable, so text in a bill note cannot talk the model into paying. Summaries of what happened are built by code from the database, and the model's text is shown separately as an "agent's note".
- **Neon Postgres** (provisioned through the Vercel Marketplace) with Drizzle. For judges and local runs, a zero-install `pglite://` mode runs Postgres in-process and seeds the demo day.
- **AG Grid Community** for the History ledger: custom theme, Spanish and Polish locale packs, external filter driven by the AI view, pinned totals row, CSV export.
- **Web Speech API** for push-to-talk and spoken confirmations, with a text fallback.
- **About 500 unit and integration tests** (Vitest, against real Postgres via PGlite) and a Playwright smoke test.

## Challenges we ran into

Most of these only showed up against the real sandbox:

- **The invoice QR endpoint returns `multipart/form-data`**, not JSON, and answers `406` when the request asks for JSON. We parse the image part ourselves.
- **PayPal rounds sales tax per line.** A ticket with several taxable lines can differ by a cent from one rounded total. Stall now rounds tax per line the same way, so the Sell screen and the invoice agree to the cent, and PayPal's invoice total stays authoritative if they ever differ.
- **Payout ids have length limits:** `sender_batch_id` up to 30 characters and `sender_item_id` up to 63. We use deterministic 30-character ids derived from each obligation, which also makes retries safe.
- **Token scopes are fixed when the token is issued.** Enabling Invoicing on an app after the first token did nothing until we used a fresh app.
- **Webhooks are not always there,** for example in a judge's local run. The app also asks PayPal for invoice and payout status while a screen is open, so Paid and payout status still update without a tunnel.

## Accomplishments that we're proud of

- The AI agent moves real (sandbox) money, but only inside rules enforced in code, and it knows when to stop and ask.
- Closing the day twice never pays anyone twice, even with retries, webhook redeliveries and parallel tool calls.
- The whole demo day runs end to end against PayPal's sandbox: spoken order, invoice, QR, payment, payout, held duplicate, decision.

## What we learned

The hard part of an agent that handles money is not the model, it is everything around it: idempotency keys, deterministic ids, status that can arrive late or out of order, and being honest with the owner about what actually happened. Letting code decide what is allowed and letting the model explain it turned out to be the right split.

## What's next for Stall

- Venmo as a payment option for US customers, and Zettle for shops that already have a reader.
- Sales tax by location for trucks that move between cities.
- Weekly invoices for wholesale customers, and more languages.
- A native app shell for better offline voice capture.

---

## Testing instructions (for judges)

1. Open https://stall-ashen.vercel.app and enter PIN `1234`.
2. On **Sell**, type `two tacos al pastor and an agua fresca` (or hold the mic and say it), tap **Read order**, then **Charge**.
3. Open the QR or the pay link and pay on PayPal's sandbox page with **Debit or Credit Card** (use a test card from the Credit Card Generator in your PayPal Developer Dashboard) or with any sandbox Personal account. Within a few seconds Sell shows **Paid**. To skip PayPal, tap **Paid in cash**.
4. Open **Today**, then **Close the day**, then **Run close now**. Maria's $120 shift is paid through PayPal Payouts. The tortilla bill is held as a possible duplicate.
5. Tap **Mark as already paid**, then **Yes, it's already paid** (nothing is sent), then **Run close again**: nothing is paid twice.
6. Open **History** and type `cash sales over $20 this week`: the AG Grid ledger filters itself and the totals row updates.

The hosted demo is shared by all judges. If the day is already closed when you arrive, open **Settings**, tap **Reset demo data**, then **Yes, reset** to start the demo day fresh. The demo also resets itself every night, shortly after midnight Chicago time.

Everything runs in PayPal's sandbox. No real money moves.
