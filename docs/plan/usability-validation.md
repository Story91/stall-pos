# Stall usability validation

Measure the flow without inventing customer validation. Separate engineering checks, author rehearsals and independent merchant tests. No merchant study has been established by this audit.

## Author rehearsal

Use the deployed sandbox build with mocks disabled. Record device, browser, commit and date. Do three attempts, keeping failures and corrections. Reset only a dedicated demo dataset between completed attempts; do not reset a shared session while anyone else is testing.

| Task | Start | Finish | Record |
|---|---|---|---|
| Bill | Begin speaking or typing | QR visible | Seconds, mode, corrections, amount |
| Payment | Open pay link | Owner sees Paid | Seconds, method, checkout friction |
| Close | Tap Run close now | Payout and decision appear | Seconds, failures |
| Decision | Read supplier card | Marked paid, no new payout | Choice, confusion, assistance |
| Repeat close | Tap Run close again | No new payout for handled obligation | New payout count |
| History | Submit question | Correct rows shown | Seconds, correctness |

Report all attempts. QR time excludes customer checkout unless explicitly included. This is not a user study or a comparison with competing software.

## Optional independent 15-minute session

Invite an owner of a stall, mobile service or another face-to-face business. Explain sandbox money and seeded history. Ask permission to record and separately to publish any quotation; an unrecorded session is fine.

Ask how they currently record sales and settle money owed. Ask what is frustrating without suggesting voice is necessarily better.

Give these tasks without demonstrating the buttons:

1. Record two tacos at $4.50 each and inspect the bill.
2. Correct the quantity to three before charging.
3. Find what is owed to Maria and close the day.
4. Decide what to do with the supplier bill resembling an earlier payment. Explain why.
5. Find cash sales from the last seven days.

Observe completion, errors, hesitation and help. Ask: “Which step would you use?”, “What would stop you trusting it?”, “What is missing before you could try it at work?”

## Session record

Participant code: ____  Business type: ____  Date: ____

Device/browser: ____  Language: ____  Commit: ____

Type: author rehearsal / independent merchant test

Permission to record: ____  Permission to quote: ____

| Task | Completed without help | Seconds | Errors or help | Exact words if permitted |
|---|---|---|---|---|
| Bill | | | | |
| Correction | | | | |
| Close | | | | |
| Decision | | | | |
| History | | | | |

Observed friction: ____  Change made: ____  Retest: ____

If no merchant participates, say: “Designed for face-to-face microbusinesses; merchant validation is a next step.” AI personas can help generate questions, not participants, quotes or success rates.
