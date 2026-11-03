# Sponsor / partner tools (2026-11-03)

Partner tools are optional. Each has a prize for "any eligible submission that uses any <partner> tools". Sponsor prizes stack with one Grand Prize or one Honorable Mention.

| Partner | What it is | Free offer | Natural integration | Prize | Worth it? |
|---|---|---|---|---|---|
| **AG Grid** | JS data grid (Community MIT; Enterprise paid, 30-day trial) | Community free forever | Any ledger / transaction table / "cap table" view with AI "ask the grid" | $5,000 / $2,000 / 3×$1,000 — **biggest sponsor pot** | **Yes.** Cheap to add, 5 prizes. Use Enterprise trial features (pivot, charts, server-side) for "best use". |
| **Render** | Cloud hosting (web services, workers, Postgres, cron, static) | Free static sites, free web service tier | Host backend + Postgres; needed anyway for a public webhook URL | $1,000 / $750 / $500 credits | **Yes.** Zero marginal cost, gives a hosted demo URL. |
| **APIMatic** | SDK / docs / "Context Plugins" + MCP generated from OpenAPI | Free trial | Generate a typed client for PayPal REST (esp. Payouts, which the toolkit lacks); mention Context Plugin used during dev | 3×$1,000 + 6 mo subscription | Maybe, if we touch raw REST. Low effort for a $1,000 lottery ticket. |
| **Bryntum** | Scheduler / Gantt / Calendar / TaskBoard / Grid components | Free trial | Payout schedules, rotation calendars, job boards; AI must be a "genuinely useful feature" | 3×$1,000 | Only if the idea has a calendar/schedule at its core (Tanda, Raincheck). |
| **Channel3** | Product search API, 100M+ products, 25k retailers | 20,000 credits, promo `PAYPAL-HACKATHON-2026` (unverified) | Shopping agents only | $1,500 | No, unless shopping (crowded). |
| **Kernel** | Cloud Chromium browsers for agents, auth vaults | $5/mo free credits ($50 claimed for hackathon) | Browser agents that buy things | none listed | No. |
| **Elastic** | Search / vector DB | 14-day trial | Semantic search over transactions, disputes | none listed | No (Postgres + pgvector suffices). |
| **Postman** | API platform, MCP server, collections | Free plan | Ship a Postman collection for our API; use during dev | none listed | Nice-to-have: a public collection makes judges' testing easier. |
| **Zapier** | No-code automation, MCP | Free plan | Side effects (Slack/email) | none listed | No. |
| **Astropods** | "Agent OS": budgets, guardrails, observability for agents | Free signup credits | Spend caps for a paying agent | none listed | No (we'll implement spend caps ourselves; it's core logic). |

## Recommended partner stack for any of the 5 ideas

1. **AG Grid** (Community or Enterprise trial) for the main data view + an "ask the grid in plain English" AI feature. Targets the $5k sponsor prize.
2. **Render** for hosting backend + Postgres + webhook endpoint. Targets Render credits and satisfies "hosted demo URL".
3. **Postman** public collection (free, 1 hour of work) — judges can poke the API; counts as design/presentation polish.
4. **APIMatic** only if time remains.
