# Stall demo film production

Target: 2:40, English narration and captions, 1920×1080. Animation explains the problem and transitions. Real screen recordings demonstrate every product action. No actor or merchant testimonial is needed.

## Timeline and finished narration

| Time | Picture | English narration |
|---|---|---|
| 0:00–0:12 | Illustrated vendor with phone and notebook. Label: “Illustrative business scenario”. | “A sale is only the beginning. A small business owner still has to record it, pay the helper, and check the supplier's bill. Stall brings those steps into one conversation.” |
| 0:12–0:34 | Actual Sell screen. Choose Spanish; say “Dos tacos al pastor”. Show actual transcript, items and review. | “The owner speaks in Spanish. AI turns the order into editable items and matches them to the catalog. The owner checks the quantities and prices before charging.” |
| 0:34–1:02 | Actual Charge, QR, customer sandbox checkout, matching Paid screen. Label: “PayPal sandbox · no real money”. | “Stall creates an itemized PayPal invoice. The customer scans and pays. The paid status comes from PayPal, through a webhook or a status check. The model cannot declare that money arrived.” |
| 1:02–1:16 | Today, showing Maria's shift and supplier bill. | “The owner's recorded obligations are the source of truth. Maria has a logged shift. A supplier bill is also waiting. The agent never invents who is owed money.” |
| 1:16–1:47 | Actual Close. Maria Sending, then actual Paid. Rosa's two bills. Label the earlier bill “Seeded example of a previous payment”. | “At closing time, the agent can pay within code-enforced limits. Maria's payout goes through PayPal. A duplicate-check rule flags this supplier bill against a previous record. Stall shows the evidence and asks the owner to decide.” |
| 1:47–2:02 | Mark as already paid, confirm, Run close again. Show actual outcome. | “The owner marks it as already paid. No new payout is sent for that decision. Running close again leaves the handled obligations alone.” |
| 2:02–2:19 | Actual History, question “cash sales over $20 this week”, matching rows and total. Label “Seeded example history”. | “The owner can also ask questions about the ledger. AI selects the filters. The table and totals are calculated from the matching records, so the answer can be checked.” |
| 2:19–2:33 | Diagram: speech → AI interpretation → owner review and code rules → PayPal → recorded outcome. | “AI interprets language and coordinates tools. Code controls amounts and permissions. PayPal supplies payment status. Each layer has a clear job.” |
| 2:33–2:40 | Stall, demo URL, repository. | “Stall. Sell and settle in your language. Built with PayPal sandbox and AI.” |

## Recording instructions

- Capture the actual device used. Desktop footage demonstrates desktop operation, not phone speech recognition. Record an actual supported phone before claiming a working mobile voice demonstration.
- If voice fails, show the visible text fallback and narrate “The owner enters the order in Spanish” instead. Do not animate speech success over a failed recording.
- Keep invoice and amount consistent between customer and owner clips. A QR alone does not prove payment.
- Show payout success only after PayPal reports it. Label shortened waits “Waiting time shortened”. Do not promise fixed settlement time.
- Keep Money check outside the timed core flow if PayPal reporting has not caught up. Never replace a waiting result with a fabricated match.
- Save original clips. Crop credentials and unrelated personal information; do not replace financial outcomes in editing.
- Seeded sales and the earlier Rosa payout illustrate history. They are not past PayPal transfers or customer traction.
- Use original or licensed visual/audio assets. An AI character illustrates the scenario, not a real testimonial.
- If synthetic narration is used, end-card disclosure: “AI-assisted illustrations and narration; product footage recorded from the application”. Remove “narration” if the author records it.

## Brief for Claude Design

Create a 16:9 film composition for Stall, maximum duration 2:40. Visual direction: warm paper, near-black ink, marigold accents, large readable text. Illustrate one small business owner at a taco stand; label it as illustrative. Use a restrained animated opening and a simple final architecture diagram.

Reserve video placeholders for the seven real product clips in the timeline. Do not reconstruct app screens, invent amounts, generate PayPal confirmations, animate unimplemented behavior or add customer quotations. Use actual supplied recordings at readable size; captions must not obscure controls.

Use the narration above. Keep “PayPal sandbox · no real money” visible during payment footage. Label seeded history and the earlier supplier bill. Missing footage must remain a visible “recording required” placeholder in the working composition and must be replaced before submission. Deliver an editable composition and MP4 once the real clips are inserted.

## Capture list

1. Sell: language, microphone or explicitly identified text input, items and review.
2. Charge and QR.
3. Customer checkout and matching Paid screen.
4. Today: recorded shift and bill.
5. Close: pending/success payout and duplicate evidence.
6. Owner decision and repeated close.
7. History question and result.

Sources: [official video requirements](https://paypalaihackathon.devpost.com/rules). Status: script prepared; actual footage and final export still required.
