# PayPal AI Hackathon 2026 — workspace

> Deadline: **Thu Nov 12, 2026, 12:00 PT (21:00 Warsaw)**. Judging Dec 1–15. Winners ~Dec 21.
> Rules verified Nov 3, 2026: `docs/research/01-hackathon-rules.md`.

This folder is the pre-build workspace. The product itself will live in `app/` once an idea is chosen and its design doc is approved (see `CLAUDE.md`).

## Start here

1. `docs/ideas/00-shortlist.md` — five candidate ideas, scored against the judging criteria, with a recommendation.
2. `docs/research/` — what the judges want, what 50+ competitors are building, what PayPal's sandbox and Agent Toolkit can do, which sponsor prizes are cheap to win.
3. `docs/plan/timeline.md` — the 9-day plan. `docs/plan/submission-checklist.md` — tick daily.

## Folder map

```
CLAUDE.md                         rules for Claude Code in this project (stack, PayPal rules, quality bar)
.claude/skills/paypal-sandbox     auth, endpoints, webhooks, gotchas
.claude/skills/paypal-agent-toolkit  43 built-in tools + how to add Payouts etc.
.claude/skills/hackathon-judge    the official rubric as a review skill
.claude/skills/demo-video         3-minute video rules
.claude/agents/hackathon-judge.md subagent that scores the project 1–5 on the five criteria
.mcp.json                         PayPal's official MCP server (local, sandbox) for Claude Code / Desktop
.env.example                      every variable the app will need
scripts/get-sandbox-token.ps1|sh  fetch a sandbox bearer token into .env
scripts/smoke-test.mjs            token → create order → read → transactions → balances
docs/research/                    01 rules · 02 competition · 03 PayPal tooling · 04 partner tools
docs/ideas/                       00 shortlist · 01 HireHuman · 02 Upstream · 03 Tanda · 04 Toll · 05 Raincheck · 06 Understudy · 07 Referee · 08 Stall
docs/plan/                        timeline · submission checklist · video script · proposed settings.json
LICENSE                           MIT (required: visible open-source license)
```

## First 30 minutes (do today)

```bash
cp .env.example .env
```

1. https://developer.paypal.com/dashboard → Apps & Credentials → Sandbox → Create App → paste `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` into `.env`.
2. Testing Tools → Sandbox Accounts → note the Business and Personal logins; create 2–3 more Personal accounts (payout recipients).

```bash
node scripts/smoke-test.mjs
```

3. Copy `docs/plan/claude-settings.proposed.json` to `.claude/settings.json` (Claude Code will not write its own settings).
4. Pick the idea in `docs/ideas/00-shortlist.md`, then ask Claude Code to write the design doc (`superpowers:brainstorming` → `writing-plans`).

## Recommended Claude Code plugins / skills

Already available in this session: `superpowers` (brainstorm → plan → TDD → review), `frontend-design`, `vercel:*` (AI SDK, deploy), `stripe:*` (ignore), `dataviz`, `engineering:code-review`, `engineering:documentation`, `marketing:draft-content` (Devpost text).

Worth installing for the build: nothing else is required. The PayPal-specific knowledge is in `.claude/skills/`.
