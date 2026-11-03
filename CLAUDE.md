# PayPal AI Hackathon 2026 — project rules for Claude Code

Deadline: **Nov 12, 2026, 12:00 PT (21:00 Warsaw)**. Nine days from Nov 3. Every decision optimizes for a working, demoable, judge-runnable product by Nov 11.

## What this folder is

- `docs/research/` — verified facts: rules, judging criteria, prizes, competition map, PayPal tooling, partner tools. Treat as source of truth; re-verify only if something looks stale.
- `docs/ideas/` — 5 candidate ideas with prize targeting. One gets chosen; its design doc then lives in `docs/superpowers/specs/`.
- `docs/plan/` — day-by-day timeline, submission checklist, video script template.
- `.claude/skills/` — project skills: PayPal sandbox, Agent Toolkit, hackathon judging, demo video.
- `.claude/agents/hackathon-judge.md` — a reviewer agent that scores the project against the five official criteria.
- `scripts/` — sandbox helpers (token, smoke test).
- App code goes in `app/` (one Next.js project) once the idea is chosen. Do not scaffold it before the design doc is approved.

## Judging criteria (equal weight) — design every feature against these

1. Technological Implementation — thorough, skillful, non-trivial use of PayPal + AI.
2. Design — complete, coherent product, not a proof of concept.
3. Potential Impact — specific real problem, real audience, demonstrably solved.
4. Innovation — differs from existing concepts (see competition map).
5. Presentation — video shows end-to-end; pitch says problem / who / why.

## Stack (decided; change only with a reason written in the design doc)

- **Runtime**: Node 26, TypeScript strict, pnpm or npm (use what's installed: npm 11).
- **App**: Next.js App Router (latest stable), React, Tailwind. One repo, `app/` folder. Server code in route handlers / server actions; long-running agent loops in a separate worker if needed.
- **AI**: Vercel AI SDK 7 (`ai` package) with Claude via `anthropic/claude-sonnet-5-5` (AI Gateway string) or `@ai-sdk/anthropic` direct with `claude-sonnet-5-5`; use `claude-opus-5-5` only for the hardest judgment step if latency allows. Tool calling via `generateText`/`streamText` with `maxSteps`.
- **PayPal**: `@paypal/agent-toolkit` (`/ai-sdk` subpath) for the 43 built-in tools **plus our own tools** for anything it lacks (Payouts, webhooks, platform fees) written against REST with a tiny typed client (`lib/paypal/client.ts`): token cache + refresh, `PayPal-Request-Id` on every POST, zod-validated responses.
- **DB**: Postgres on Render (or Neon) via Drizzle. SQLite is acceptable for local dev only if the schema is identical.
- **UI data**: AG Grid (Community; Enterprise trial if a feature needs it) — target the sponsor prize.
- **Hosting**: Render (web service + Postgres + cron). Vercel is a fallback for the frontend only.
- **Tests**: Vitest for units (PayPal client with recorded fixtures, policy/limits logic, AI output parsers). One Playwright smoke test for the happy path if time allows.
- **MCP**: if the idea exposes an MCP server, use `@modelcontextprotocol/sdk`, stdio + streamable HTTP.

## PayPal rules (non-negotiable)

- Sandbox only. `PAYPAL_ENV=sandbox`, host `https://api-m.sandbox.paypal.com`.
- Never log or commit `PAYPAL_CLIENT_SECRET`, tokens, or webhook IDs. `.env` is gitignored; `.env.example` lists every variable.
- Every money-moving call: idempotency key, amount validated as string with 2 decimals, currency explicit, result persisted before responding to the agent.
- Agent spending has hard limits enforced in code (per call, per day), not in the prompt.
- Webhooks: verify signature via `/v1/notifications/verify-webhook-signature` before acting.
- Read `.claude/skills/paypal-sandbox/SKILL.md` before touching any PayPal endpoint.

## Quality bar

- Follow superpowers workflow: brainstorm → design doc → plan → TDD → review. Spikes are allowed and labeled.
- Small commits, conventional messages, `main` always runs. Tag `v1.0-hackathon` at submission.
- README is written for a judge with 15 minutes: run instructions first, sandbox test accounts included, PayPal features listed with file links.
- Demo data: seed script creates a realistic, non-embarrassing dataset (no lorem ipsum, no "test test").
- UI: see `frontend-design` skill; no default-template look. Empty, loading, and error states exist for every screen that appears in the video.

## Language

- User-facing docs for the author: Polish is fine. Everything that ships (README, UI, video, Devpost text, code comments): English.

## Daily ritual

1. Read `docs/plan/timeline.md`, confirm today's DoD.
2. Build. Keep `main` green.
3. Run `/hackathon-judge` (the agent) on days 5 and 7; fix the lowest criterion first.
4. Tick `docs/plan/submission-checklist.md`.
