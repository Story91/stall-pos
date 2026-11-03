# Stall — design document

Date: 2026-11-03 · Status: draft for approval · Target: PayPal AI Hackathon 2026 submission by Nov 11, 2026

## 1. Intent

Stall is a voice-first point of sale and back-office agent for small businesses that sell face-to-face and have no point of sale: food trucks, market and fair vendors, pop-ups, mobile services (barbers, cleaners, handymen), tutors, street artists. The owner speaks the sale in their own language; Stall turns it into an itemized PayPal invoice with sales tax and an optional tip, shows a QR code, and confirms payment out loud. In the evening, an AI agent closes the day on the owner's behalf: reconciles, pays helpers and suppliers through PayPal Payouts, bills wholesale customers, chases unpaid invoices and suggests tomorrow's prep.

Why it matters: in the US alone, millions of micro-businesses take payment with a Venmo sticker, a cash box and a notebook. Customers increasingly carry no cash. Existing POS (Square, Zettle, Toast) assumes a reader, a menu grid and English. Stall assumes a phone, a voice and whatever language the owner speaks.

Why PayPal: Invoicing with QR codes is the only mainstream rail where a seller can itemize, tax, tip, and get paid by PayPal, Venmo (US) or a guest card, with no hardware. Payouts gives same-day pay for helpers. Both are in the free sandbox.

Why now: PayPal's Agent Toolkit exposes 20 invoicing tools; LLMs parse messy multilingual speech reliably; the hackathon rewards agents that transact.

## 2. Goals

1. Speech → confirmed line items → PayPal invoice with QR in under 10 seconds on a phone, in English and Spanish at minimum (Polish demonstrated as "any language").
2. Payment confirmation (PayPal, Venmo where sandbox allows, guest card) reaches the phone via webhook and is spoken aloud.
3. Cash sales recorded with one tap/word so the day's picture is complete.
4. Sales tax computed from the business's current location (US state + optional local rate), itemized on the invoice.
5. "Close the day" agent: summary spoken and written; Payouts to configured payees within rules; recurring invoices for wholesale customers; reminders for unpaid invoices; tomorrow's suggestions. Every action has a visible one-sentence rationale and a log entry.
6. Dashboard (AG Grid): sales, items, taxes, payouts, with "ask your sales" in natural language.
7. Monthly export (CSV) suitable for a bookkeeper (1099-K / Schedule C framing).
8. Judge-runnable: `npm install`, `.env`, `npm run dev`, seed data, sandbox accounts in README; hosted on Render.
9. A < 3 minute video showing the full loop with money visibly moving in the sandbox.

## 3. Non-goals

- No card reader, no receipt printer, no inventory counts, no table management.
- No multi-location or multi-user roles; one business, one owner.
- No live tax API (Avalara/TaxJar); a bundled table of US state rates plus editable local rate is enough for the demo and honest in the README.
- No native iOS/Android app; a PWA is the product.
- No production PayPal; sandbox only, stated everywhere.
- No accounting integrations (QuickBooks etc.); CSV export only.
- No marketplace between vendors and customers; the customer side is PayPal's own invoice page.

## 4. Anti-goals (what would make it a failure even if it works)

- The agent moves money the owner did not authorize by rule. Hard limits in code, never only in the prompt.
- A "chat with your POS" wrapper where the AI is decorative. The AI must do parsing, tax/tip reasoning, multilingual confirmation, and evening decisions that are visible.
- A demo that only works with the author at the keyboard. Judges must reproduce it from the README in 15 minutes.
- Default-template UI. The phone screen in the video must look like a product a vendor would trust with money.
- Secrets or real personal data in the repo or the video.

## 5. Users and the two moments

**Owner at the counter** (hands busy, noisy, 10 seconds of attention): tap-and-hold the mic, speak the order, glance at the parsed items, tap "Charge", show the QR, hear "Paid, $18.40". If the parse is wrong, tap an item to edit or say it again.

**Owner in the evening** (tired, phone on the couch): tap "Close the day" or let the 8 pm job run. Hear the summary. See the list of what the agent did and wants to do (paid Maria $120; sent the weekly invoice to Blue Oak Café; two invoices unpaid, reminders sent; suggests 20% more tortillas tomorrow because Saturday + sunny). Approve anything above the rule threshold with one tap.

**Customer** (not our user): scans the QR, lands on PayPal's invoice page, pays with PayPal, Venmo or card. No app.

**Judge**: reads README, runs the app or opens the Render URL, logs into the sandbox buyer, pays an invoice, sees the webhook flip the sale to paid, triggers "Close the day", sees Payouts in the sandbox.

## 6. Product shape

### 6.1 Vendor PWA (mobile-first, also fine on desktop)

Screens: Sell · Day · Close · Settings. Plus a desktop Dashboard route with AG Grid.

- **Sell**: big mic button (push-to-talk), language auto-detect with manual override, parsed line items with qty/price/tax flag, running total, tip toggle (none / 15 / 18 / 20 / custom), "Charge" → QR screen (invoice QR from PayPal plus the pay link and a "Cash" button). Status: Waiting → Paid (webhook) with voice confirmation and vibration. "New sale" resets.
- **Day**: today's sales list with status (paid / cash / unpaid / cancelled), totals, taxes collected, tips.
- **Close**: the agent's summary and action list with rationale; approve/decline items above threshold; "Run close now" for the demo.
- **Settings**: business name, location (state + city + local rate, GPS suggest), languages, catalog (items with default prices, learned from speech), payees (name, PayPal email, role, max per day, auto-pay yes/no), wholesale customers (name, email, weekly items, day of week), tax-exempt items list.
- **Dashboard** (`/dashboard`, desktop): AG Grid of sales and payouts, grouping by day/item, totals, chart; "Ask your sales" box that turns a question into a grid filter/aggregation and a spoken sentence.

### 6.2 Flows

**Sell flow**
1. Push-to-talk captures audio via the browser's Web Speech API (Chrome/Android/desktop Chrome; works for en/es/pl/vi/ko). Text fallback field always visible. (Builder may add server-side ASR via an API if Web Speech proves unreliable on the recording device; keep the interface identical.)
2. Transcript + catalog + language → Claude → structured items `{ name, qty, unitPrice, taxable, catalogMatch }` with a confidence per item and a spoken-back confirmation string. Low-confidence items are highlighted.
3. Owner confirms → server computes subtotal, tax (jurisdiction table), tip, total → creates a PayPal invoice (Invoicing v2 via REST, deterministic), sends it, generates the QR → stores Sale with invoice id → returns QR + link.
4. Customer pays on PayPal's page → webhook `INVOICING.INVOICE.PAID` → signature verified → Sale marked paid → push to the phone (SSE) → voice "Paid, $18.40, thank you".
5. Cash: owner taps Cash → `record_payment` on the invoice (method CASH) → Sale marked paid-cash.

**Close-the-day flow (the agent)**
1. Trigger: cron 20:00 business-local on Render, or "Run close now".
2. Agent (Vercel AI SDK `generateText` with tools, maxSteps ≤ 12) gets: today's sales, catalog, payees + rules, wholesale customers + schedule, unpaid invoices, weather tomorrow (Open-Meteo, free), last 14 days history.
3. Tools available to it: `list_today_sales`, `pay_payee` (custom, Payouts, enforces per-payee daily max + allowlist; above max → creates an approval request instead), `create_recurring_or_weekly_invoice` (Invoicing create+send for wholesale customers due today), `send_invoice_reminder` (toolkit), `propose_prep` (writes suggestion), `write_summary`.
4. Every tool call is logged with the model's one-sentence rationale (required field in each tool's input). The Close screen renders the log. Approval requests show as cards with Approve/Decline; approving executes the payout.
5. Summary is spoken (browser TTS) and stored.

**Payout rules** (code, not prompt): payee must exist and be enabled; amount ≤ payee.maxPerDay − paidToday; business-level daily cap; currency USD; idempotent `sender_batch_id` = `close-{date}-{payeeId}`; otherwise → approval request. Webhooks `PAYMENT.PAYOUTS-ITEM.SUCCEEDED|FAILED|UNCLAIMED` update status.

**Tax**: `taxRate(state, localRate)`; bundled table of US state rates (2026 values, cited source in README); per-item `taxable` default from catalog (e.g. in many states unprepared groceries are exempt; the owner marks items). Tax line shown on the invoice as a separate item or using the invoice's tax field per PayPal's schema (builder chooses whichever renders clearly on the PayPal page).

**Tip**: owner toggles before charging; added as an invoice line "Tip". (PayPal invoices also support allowing the payer to add a tip; builder uses it if it renders in sandbox, otherwise the line item.)

### 6.3 Data model (Postgres via Drizzle)

business, catalog_item, sale (invoice id, status, lines json, subtotal, tax, tip, total, method, language, transcript), payee (name, email, role, max_per_day, auto_pay), payout (batch id, item id, status, rationale, approval state), wholesale_customer (name, email, weekday, lines json), agent_run (date, summary, log json), approval_request, webhook_event (id, type, processed_at) for idempotency, tax_jurisdiction (state, rate, local_rate).

### 6.4 Architecture

- One Next.js (App Router) project in `app/`; TypeScript strict; Tailwind; PWA manifest + service worker (offline shell only).
- Server: route handlers for sell/close/webhook/dashboard-query; a `lib/paypal` client (token cache, `PayPal-Request-Id`, zod-validated responses) with modules `invoices.ts`, `payouts.ts`, `webhooks.ts`; `lib/agent` with the close-the-day tools; `lib/tax`; `lib/parse` (speech → items prompt + schema).
- AI: Vercel AI SDK 7, Claude Sonnet 5.5 for parsing and the close agent; structured outputs via zod; PayPal Agent Toolkit (`/ai-sdk`) supplies invoice reminder/search tools to the agent; the hot sell path uses REST directly for determinism and speed.
- Realtime to phone: Server-Sent Events from a `/api/events` route; polling fallback.
- Hosting: Render web service + Render Postgres + Render cron (close-the-day); public webhook URL from Render. Local dev: `cloudflared` tunnel for webhooks, or the dashboard's webhook simulator.
- Tests (Vitest): parse schema + a dozen transcripts in 3 languages (recorded model outputs as fixtures), tax calc, payout rules, webhook signature verification (recorded sandbox payload), invoice payload builder. One Playwright smoke: sell → QR shown.

### 6.5 Seed / demo data

A taco truck "La Esquina" in Austin, TX (state 6.25% + local 2% = 8.25%), catalog of 12 items in English/Spanish, one helper (Maria, prep cook, $120/day auto), one supplier (Tortillería Rosa, manual approval above $200), one wholesale customer (Blue Oak Café, weekly Thursday order), 14 days of plausible history for the dashboard. Sandbox accounts: business (the truck), personal buyer (customer), two personal accounts for Maria and the tortillería.

## 7. Constraints

- 9 days, one developer with Claude Code; freeze features on day 5 (Nov 8); video on Nov 10; submit Nov 11.
- PayPal sandbox only; everything demonstrable without approval from PayPal.
- Repo public, MIT, English; `.env.example` complete; no secrets.
- Video < 3:00, YouTube public, no copyrighted music.
- Sponsor tools: AG Grid (Community; Enterprise trial only if a feature is needed), Render. Others skipped.

## 8. Decided by the author (user) and the designer

- Idea: Stall, US market, general small businesses that sell face-to-face; video opens with one concrete scene (food truck) as the example, pitch addresses the broader audience. (User: "general for businesses"; designer's call on using one scene, because the judging criteria require a specific audience in the demo.)
- Voice via browser Web Speech API with text fallback (designer's call; cheapest and instant).
- Tax from a bundled table, not an API (designer's call).
- LLM parses and decides; code executes money moves deterministically with limits (designer's call).
- Working name Stall; rename is free until day 6.

## 9. Left to the builder

- Exact prompts and schemas; how catalog learning works (suggest a price after N sightings).
- UI layout and visual design (follow `frontend-design`; must look trustworthy, high contrast for sunlight, big touch targets).
- Whether tax/tip use PayPal invoice fields or line items (whichever renders well in sandbox).
- SSE vs polling details; PWA caching.
- Dashboard "ask your sales": translation of the question into AG Grid filter model + aggregation; start with 6 supported question types.
- Weather call and prep-suggestion heuristic.
- Test fixtures and seed script details.

## 10. Risks and mitigations

- Web Speech API fails on the recording device → server ASR via an API behind the same interface; text input always there.
- Sandbox latency 2–5 s per invoice create+send → show a progress state; do not claim "2 seconds" anywhere.
- Venmo not available in sandbox invoice page → say "PayPal, card, and Venmo in production (US)"; demo with PayPal buyer.
- Webhook delivery delay in sandbox → the QR screen also polls the invoice status every 3 s.
- "Why not Square/Zettle" → first 30 seconds of the video and a README section.

## 11. Video (2:40)

0:00 A line at a food truck; a customer holds up a phone, "do you take cards?" 0:10 "Three million US micro-businesses take payments with a sticker and a notebook." 0:20 Owner speaks the order in Spanish; items appear, tax added, tip toggled; Charge; QR. 0:50 Customer scans, pays (sandbox); phone says "Paid, $18.40". 1:10 Second sale in English; third in cash. 1:30 Evening: "Close the day" → summary spoken; Maria paid $120 (Payouts, sandbox balance rises); weekly invoice to Blue Oak Café sent; reminder sent; approval card for the tortillería. 2:05 Dashboard AG Grid: "What sold best on rainy days?" 2:25 "Phone, voice, any language. Built on PayPal Invoicing and Payouts in the sandbox." 2:40 Name, repo.
