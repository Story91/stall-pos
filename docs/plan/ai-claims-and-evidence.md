# Stall claims and evidence

Use these boundaries in the film, README and description. Based on the code reviewed on 6 November 2026; recheck after changes.

| Topic | Accurate statement | Code evidence | Avoid |
|---|---|---|---|
| Speech | Browser recognition produces a transcript; AI parses it. Text is a fallback. | `voice/transcribe.ts`, `parse/parseSale.ts` | Any language, every phone. |
| Sale | AI extracts items; catalog matching supplies known prices. Owner reviews before charging. | `parseSale.ts`, `matchCatalog.ts` | AI knows the correct price of any product. |
| Payment | PayPal status drives Paid. | `paypal/webhooks.ts`, `salesApi.ts` | AI confirms that money arrived. |
| Duplicate | Code compares payee and similar amounts or matching notes within seven days. It flags a possible duplicate. | `close/rules.ts` | AI discovered fraud; the bill is definitely fraudulent. |
| Agent | AI calls tools and explains actions. Code determines permitted automatic payments and finishes permitted actions the model leaves undone. | `close/agent.ts`, `close/runClose.ts` | Every payment is exclusively an AI decision. |
| Limits | Automatic payments pass rule checks. Owner approval is a separate path. Concurrent execution remains an audit item. | `close/rules.ts`, `decisions.ts` | No payment can exceed a limit under any circumstances. |
| Repeated close | Stored results and deterministic obligation IDs protect repeated handling of an obligation. Demonstrate that specific case. | `close/batchId.ts`, `runClose.ts` | Impossible to pay twice, even across resets or payments outside Stall. |
| History | AI selects filters; code computes totals from matching records. | `historyAsk.ts`, `historyView.ts` | The model computes financial totals. |
| Money check | Read-only comparison with PayPal Transaction Search; fresh activity may not appear yet. | `close/reconcile.ts`, `paypal/reporting.ts` | Instant settlement or complete accounting verification. |
| Tax | One configurable demonstration rate. | `money.ts`, settings | Automatic US tax compliance. |
| Seed data | Fictional business, historic sales and earlier Rosa payout illustrate the scenario. | `db/seed.ts` | Customer traction or actual historical PayPal transfers. |
| Validation | Automated tests and sandbox recordings validate specific technical behavior. | Test results and raw clips | These are a merchant study. |

Paths above are relative to `stall/src/lib/`, except `db/seed.ts`, which is relative to `stall/src/`.

## Evidence needed

- Current deployed sale recording showing one invoice reaching Paid.
- Current payout success and repeated close with no additional payout for the handled shift.
- Fresh-browser hosted access check.
- For any speed claim: device, browser, input mode, number of attempts, failures and exact start/end events.
- No testimonial, savings percentage or adoption claim until observed directly and approved for publication.

AI illustrations and fictional personas can explain a scenario. They cannot establish demand, satisfaction or usability.
