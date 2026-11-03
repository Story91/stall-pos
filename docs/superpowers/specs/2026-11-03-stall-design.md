# Stall — design document (v2)

Date: 2026-11-03 · Status: **approved with corrections** (author + external review) · Target: PayPal AI Hackathon 2026 submission by Nov 11, 2026

Changes from v1: differentiator restated (Square Tap to Pay needs no reader either), scope cut to a core loop, day-0 end-to-end PayPal spike made mandatory, close-the-day made idempotent and tied to shifts/bills, honest "works / demo / later" split, weather suggestion replaced by the agent's "hold" moment.

## 1. Intent

Stall lets a small face-to-face business run sales and settle the day **by talking, in the owner's language, with almost no setup**. The owner speaks the sale; Stall turns it into an itemized PayPal invoice, shows a QR code, and says "paid" when the money arrives. In the evening the owner says "close the day"; an AI agent reconciles, pays what the owner has logged as owed through PayPal Payouts, and **stops and asks** when something looks wrong.

Who: food trucks, market and fair vendors, pop-ups, mobile services, tutors. Product direction is "any business that sells face-to-face"; the demo is one taco truck, one day.

Why not Square / Zettle / Toast: they also take payments with just a phone (Square Tap to Pay). Their model is a menu grid, taps, English-first setup, and a separate world for paying helpers and suppliers. Stall's wedge is different: **conversation instead of configuration**. No menu to build (the catalog learns from speech), the owner's language on both the sale and the back office, and one agent that both sells and settles, with visible judgment about when not to act.

Why PayPal: Invoicing gives an itemized, QR-payable bill with no hardware and a payer page that accepts PayPal, card, and in the US Venmo; Payouts pays people by email the same day. Both work in the free sandbox, and the Agent Toolkit exposes invoicing to the agent.

## 2. Core loop (must ship)

1. **Sell by voice**: push-to-talk, visible language picker (English, Spanish; Polish shown once as "any language the model understands"), transcript → Claude → line items with quantities and prices from the learned catalog → owner confirms on screen (edit or re-say).
2. **Charge**: server builds the invoice (items, one configurable tax rate for the business, optional tip line), creates and sends it via PayPal Invoicing v2, generates the QR, shows QR + pay link + "Cash" button.
3. **Paid**: customer scans with their phone, pays on PayPal's page; webhook `INVOICING.INVOICE.PAID` (signature-verified) flips the sale to paid; the owner's phone gets the event (SSE, polling fallback) and says "Paid, $18.40". Cash → `record_payment` with method CASH.
4. **Log what's owed**: on the Day screen or by voice: "Maria worked today" (shift) and "I owe Rosa 240 for tortillas" (bill, optional photo).
5. **Close the day** (button, or 20:00 trigger): the agent summarizes the day (spoken + written), pays each logged shift and bill through Payouts **within rules**, and for anything outside the rules or suspicious creates a decision card with its reason and the source record. The demo day has exactly: one auto payout (Maria, $120, shift logged) and one hold (the tortillería bill looks like a duplicate of a bill paid two days ago → "check before paying again", with both bills shown).
6. **Day view**: today's sales with status, totals, tax collected, tips, payouts, decisions.

Everything else is stretch or later (§4).

## 3. Goals, measured

- Speech → confirmed items → QR on screen in ≤ 10 s on a phone (sandbox latency included; show a progress state).
- Payment confirmation spoken within 10 s of the customer paying (webhook or poll).
- Close-the-day is **idempotent**: running it twice on the same day pays nothing twice and sends nothing twice.
- Every money action has a one-sentence rationale stored and shown.
- Judge can reproduce the loop from the README in 15 minutes with the provided sandbox accounts; hosted demo on Render.
- Video < 3:00 shows the loop with money visibly moving in the sandbox.

## 4. Scope: works / demo-only / later

**Works (real behavior in sandbox):** voice capture (Web Speech, text fallback), parsing in en/es/pl, catalog learning (price suggested after 2 sightings), invoice create/send/QR, webhook-confirmed payment, cash recording, shift and bill logging, close-the-day with Payouts, rule enforcement, duplicate-bill hold, decision cards with approve/decline, idempotency, Day view, CSV export of the day/month.

**Demo-only (honest in README and video):** tax is one rate the owner sets in Settings (seed: Austin, TX 8.25%), not a jurisdiction engine; Venmo is named as a production payment method, demo pays with a sandbox PayPal buyer; "any language" is demonstrated with three.

**Stretch, in priority order, only after the core loop is green end-to-end (target day 5 at the latest):**
1. AG Grid dashboard (`/dashboard`) over sales and payouts with grouping and totals (sponsor prize; small effort).
2. "Ask your sales" over the grid, 5 supported question types.
3. Invoice reminder for unpaid invoices at close (toolkit `send_invoice_reminder`, once per invoice per day).
4. Tip toggle UX (line item exists in core; the toggle is polish).

**Later (not in the hackathon build):** weekly invoices for wholesale customers, weather-based prep suggestions, tax by GPS, bookkeeping integrations, multi-user, native apps, server-side ASR unless forced by the recording phone.

## 5. Non-goals and anti-goals

Non-goals: card reader, receipts printing, inventory, tables, multi-location, production PayPal, live tax API, accounting integrations.

Anti-goals: the agent moves money not covered by an owner-logged shift/bill and a code rule; AI as decoration; a demo only the author can run; template UI; secrets or real personal data anywhere.

## 6. Day-0 spike (before any product code)

A throwaway script + manual run that proves the loop on real devices: create and send an invoice from the US business sandbox account, display the QR on the laptop, **scan it with a second phone**, pay as the sandbox Personal buyer, observe which payment methods and which payer fields the PayPal page shows, receive the webhook on a tunnel (or confirm by polling), then run a Payout to a sandbox Personal account and see its balance change. Record: latency of each step, what the payer page asks for, whether the QR resolves on mobile, any country/currency gotchas. The findings go into the README's "What the customer sees" section and decide whether polling or webhooks lead the UX.

## 7. Product shape

### 7.1 Screens (mobile-first PWA; Day and Settings fine on desktop)

- **Sell**: language picker, big push-to-talk, parsed items (qty, name, price, taxable), total, tip (none/15/18/20), Charge → QR screen (QR, link, Cash, status Waiting → Paid with voice + vibration where available), New sale.
- **Day**: sales list with status, totals; "Who worked today" chips (shift), "Log a bill" (voice or form); payouts and decisions for the day; Close the day button.
- **Close**: spoken/written summary, action log with rationale, decision cards (Approve / Decline / Mark as already paid), "Run close again" (safe).
- **Settings**: business name, currency USD, tax rate, languages, catalog, payees (name, PayPal email, role, daily rate, max per day, auto-pay), owner PIN for the hosted demo, Reset demo.
- Stretch: **Dashboard** (AG Grid).

### 7.2 Close-the-day: rules and idempotency (code, not prompt)

- Inputs: today's sales, open shifts and bills, payees and rules, recent paid bills (14 days), prior agent runs today.
- Each payout settles **one shift or one bill** (`payout.shift_id` / `payout.bill_id`, unique). A shift/bill with a payout in state SUCCESS/PENDING is skipped. `sender_batch_id = stall-{businessId}-{shift|bill}-{id}`; PayPal rejects duplicate batch ids within 30 days as a second line of defense.
- Pay automatically only if: payee enabled and `auto_pay`; amount ≤ `payee.max_per_day − paid_today`; business daily cap; currency USD; no duplicate flag. Otherwise → decision card (reason, source records).
- **Duplicate-bill hold**: a bill is flagged if the same payee has a paid bill within 7 days with amount within ±10% or identical note; card shows both bills and the earlier payout id. This is the demo "hold" moment.
- Reminders (stretch) are keyed `(invoice_id, date)`; summaries are keyed `(business, date)` and overwritten, not duplicated.
- Sales are not a precondition for paying logged obligations (a slow day still owes Maria her shift). The agent never infers an amount; it only acts on logged records.
- The model's role at close: write the summary, order the actions, phrase each rationale, and decide between "pay" and "hold" **only within** the rule outcomes the code pre-computed (it can escalate a payable item to a hold with a reason; it can never turn a hold into a payment).

### 7.3 Data model (Postgres, Drizzle)

business · catalog_item (name, aliases, default_price, taxable, sightings) · sale (invoice_id, invoice_number, status, lines, subtotal, tax, tip, total, method, language, transcript, paid_at) · payee (name, email, role, daily_rate, max_per_day, auto_pay, enabled) · shift (payee_id, date) · bill (payee_id, amount, note, photo_url, date, status) · payout (shift_id | bill_id, batch_id, item_id, amount, status, rationale) · decision (type, reason, source json, status) · agent_run (date, summary, log) · webhook_event (id, type, processed_at).

### 7.4 Architecture

- Next.js App Router in `app/`, TypeScript strict, Tailwind, PWA manifest.
- `lib/paypal`: token cache, `PayPal-Request-Id`, zod-validated responses; `invoices.ts`, `payouts.ts`, `webhooks.ts`. Hot sell path calls REST directly (deterministic); the close agent uses Vercel AI SDK tools: our `pay_obligation`, `hold_obligation`, `write_summary`, plus toolkit `send_invoice_reminder` (stretch).
- AI: Vercel AI SDK 7 + Claude Sonnet 5.5; zod structured outputs for parsing; `maxSteps ≤ 8` at close.
- Voice: Web Speech API (Android/desktop Chrome) behind `transcribe()`; browser TTS for confirmations; server ASR only if the recording phone forces it.
- Realtime: SSE `/api/events` + 3 s polling on the QR screen.
- Hosting: Render web service (webhook URL) + Neon Postgres; close trigger via "Close the day" button and an external 20:00 ping to `/api/close?key=`; paid Render plan optional (see §9).
- Tests (Vitest): parser schema with ~12 transcripts in 3 languages (fixtures), invoice payload builder, payout rules incl. idempotency and duplicate detection, webhook signature verification; one Playwright smoke (sell → QR).

### 7.5 Seed

"La Esquina" taco truck, Austin TX, tax 8.25%, 12 catalog items en/es, payees: Maria (prep cook, $120/day, auto), Tortillería Rosa (supplier, manual above $200). Demo day: Maria's shift logged; bill "tortillas 240" logged today **and** a paid bill "tortillas 240" two days ago (the duplicate). 7 days of history for the Day view. Sandbox: US business account, personal buyer, Maria, Rosa.

## 8. Constraints

9 days, one developer with Claude Code. Core loop green end-to-end by **day 4 (Nov 7)**; feature freeze day 5; video day 7; submit day 8. Sandbox only; MIT; English for everything that ships; `.env.example` complete; video < 3:00 public on YouTube; sponsor tools limited to Render and AG Grid (stretch).

## 9. Decisions

- Idea and market: Stall, US, general small businesses; one truck, one day in the video (author).
- Differentiator: conversation instead of configuration + agent that knows when to stop (author's reviewer, accepted).
- Scope cut to §2 core; §4 stretch order (reviewer, accepted).
- Owed amounts only from owner-logged shifts/bills; model never infers; sales are not a precondition (reviewer, accepted; v1 rule fixed).
- Language picker, not auto-detect; Web Speech first (designer).
- Single configurable tax rate, labeled demo (reviewer, accepted).
- Open, author to decide: recording phone (Android vs iPhone); hosting budget (free: Neon + free Render + external ping, or ~$15 paid Render through Dec 15).

**Author must do in the PayPal dashboard before day 1:** sandbox Business account with country **United States**, REST app on that account, three US Personal accounts (customer, Maria, Rosa), Client ID/Secret into `.env`, webhook once the Render URL exists.

## 10. Risks

- Payer page UX on mobile unknown until the day-0 spike → spike first; polling backs up webhooks.
- Sandbox latency → progress states; never claim seconds we did not measure.
- Web Speech on iPhone → server ASR behind the same interface.
- Duplicate-bill heuristic too eager/lazy → tune on seed; the owner always has "Mark as already paid" and "Pay anyway".

## 11. Video (2:40)

0:00 Line at a taco truck, a customer asks "do you take cards?" 0:10 "Millions of micro-businesses sell with a sticker and a notebook." 0:20 Owner speaks the order in Spanish; items appear; Charge; QR. 0:45 Customer scans, pays; phone says "Paid, $18.40"; sandbox balance. 1:05 Second sale in English, third in cash. 1:25 "Maria worked today" by voice; bill logged. 1:40 "Close the day": spoken summary; Maria paid $120 (Payouts, sandbox balance rises). 2:00 **The hold**: "This tortilla bill looks like the one paid on Tuesday — check before paying again", both bills on screen; owner taps "Mark as already paid". 2:20 Run close again: nothing paid twice. 2:30 "Sell and settle by talking, in your language, on PayPal Invoicing and Payouts." 2:40 Name, repo.
