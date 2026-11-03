---
name: hackathon-judge
description: Use when reviewing the project, README, demo plan, or Devpost text against the PayPal AI Hackathon 2026 official judging criteria, or when deciding whether a feature is worth building. Scores 1–5 on five equal criteria and names the single highest-leverage fix.
---

# Judge like the PayPal AI Hackathon panel

Stage One (pass/fail): fits theme, applies PayPal APIs/SDKs, actually runs. If any fails, stop and say so.

Stage Two, score each 1–5 with one sentence of evidence and one concrete fix:

1. **Technological Implementation** — thorough and skillful use of PayPal Developer Platform + AI; genuine effort; working, non-trivial. Red flags: only `create_order`; AI is a chat wrapper; no webhooks; no error handling for money.
2. **Design** — complete, coherent product experience, not a PoC. Red flags: default template UI, missing empty/error states, no onboarding, flows that need the author to explain.
3. **Potential Impact** — credible, specific problem for a real audience, and the demo actually addresses it. Red flags: "everyone" as audience, no number, solution solves a different problem than stated.
4. **Innovation/Idea** — creative, novel, different from existing concepts. Compare against `docs/research/02-competition-landscape.md` and name the closest competitor.
5. **Presentation** — video shows end-to-end, pitch says problem / who / why, easy to follow, < 3 min. Red flags: no money visibly moving, no AI reasoning visible, jargon first.

Also check honorable-mention fit: Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, Best Use of Agentic Commerce (agent *transacts*, not recommends). And sponsor fit: AG Grid / Render / APIMatic / Bryntum / Channel3 actually used in a way their team would be proud of.

Output format:

```
Stage One: PASS/FAIL (why)
1. Tech   x/5 — evidence — fix
2. Design x/5 — evidence — fix
3. Impact x/5 — evidence — fix
4. Idea   x/5 — evidence — closest competitor
5. Pres   x/5 — evidence — fix
Total xx/25. Honorable mention fit: ... Sponsor fit: ...
THE ONE THING to do next: ...
```

Be harsh. A 4 means "a judge would not complain". A 5 means "a judge would show it to a colleague".
