# Demo video: shot list and narration (target 2:40, hard limit 3:00)

Rules that matter: under 3 minutes, public on YouTube, shows the project working on the device it was built for, no copyrighted music, no third-party logos other than PayPal in context. Judges may score from this video alone.

## Before you record (10 minutes)

1. **Two screens.** Phone or a narrow browser window for Stall (the owner). A second phone or browser window for the customer who pays the QR.
2. Open https://stall-ashen.vercel.app on the owner screen, enter PIN `1234`, go to **Settings**, tap **Reset demo data**, then **Yes, reset**.
3. On the customer screen, have https://www.sandbox.paypal.com ready and be logged in with your sandbox buyer account (the password is in `stall/.env`, `SANDBOX_BUYER_PASSWORD`; never show that file on screen).
4. Language pill on Sell: **ES** for the first sale.
5. Close every other tab and notification. Record at 1080p. Increase cursor size if recording a desktop.
6. Use these orders. Stall rounds tax per line like PayPal, so the total on Sell and on the PayPal invoice is the same:
   - Spanish: `dos tacos al pastor y un agua fresca` ($12.99)
   - English: `two tacos al pastor and an agua fresca` ($12.99)

## Shot list

| Time | On screen | Voice-over (English) | Exact actions |
|---|---|---|---|
| 0:00–0:12 | A food truck or market stall, or just your hands holding the phone at a counter | "This is a taco truck. The customer has no cash, the owner has a sticker and a notebook. That's how millions of small businesses take payments today." | Hold the shot. |
| 0:12–0:25 | Stall Sell screen | "Stall lets the owner sell and settle the whole day by talking, in their own language, on PayPal." | Show the Sell screen, ES selected. |
| 0:25–0:45 | Sell: mic held, items appear | "I say the order in Spanish. Claude turns it into line items with the truck's own prices, and adds the sales tax." | Hold the mic, say "dos tacos al pastor y un agua fresca", release. Ticket shows 2× Taco al pastor, 1× Agua fresca, $12.99. (If the mic fails, type it and tap **Read order**.) |
| 0:45–1:05 | QR screen | "Charge creates an itemized PayPal invoice and shows its QR code. The customer pays with PayPal, a card, or Apple Pay. No app." | Tap **Charge**. QR, total and "Waiting for payment…" appear. |
| 1:05–1:20 | Customer screen, then owner screen | "The customer scans and pays…  and the truck hears it." | On the customer screen open the pay link (or scan), pay with the sandbox account. Cut back: the owner screen shows **Paid** and says it. |
| 1:20–1:35 | Day screen | "During the day the owner just says who worked and what's owed. Maria worked today. There's a tortilla bill from Rosa." | Open **Today**. Show the totals, Maria's chip, and the logged tortilla bill. |
| 1:35–2:05 | Close screen | "At night, one tap closes the day. Code sets the limits, and an AI agent works inside them. Maria's shift is paid through PayPal Payouts…" | Tap **Close the day**, then **Run close now**. Show the summary and Maria's payout going from Sending to Paid (cut the wait; it takes about 20 seconds). |
| 2:05–2:25 | Decision card | "…but the tortilla bill looks exactly like one paid two days ago. So the agent stops and asks. Both bills, side by side." | Scroll to **Needs you**. Tap **Mark as already paid**, confirm. |
| 2:25–2:32 | Close screen | "Run it again, and nothing is ever paid twice." | Tap **Run close again**. "Nothing new" appears. |
| 2:32–2:40 | Architecture card or the repo page | "Stall: PayPal Invoicing, Payouts and Webhooks, Claude, and Vercel. Sell and settle by talking." | Show a simple card: Stall · PayPal Invoicing · Payouts · Webhooks · Claude · Vercel · github.com/Story91/stall-pos |

## After recording

- Trim to under 3:00 (aim for 2:40). Every 10 seconds something should change on screen.
- Check: the money visibly moves (Paid screen, payout Paid), the agent's decision is visible (the hold card), problem, audience and why are said out loud.
- Upload to YouTube as **Public**, title "Stall: sell and settle by talking (PayPal AI Hackathon 2026)", and put the link into the Devpost "Video" field and `docs/submission/devpost.md`.
