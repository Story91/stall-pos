# Competition landscape (GitHub survey, 2026-11-03)

Method: GitHub repo search for "PayPal AI Hackathon" 2026 → 177 repos; first 50 read (descriptions only). Devpost gallery is hidden until judging. Two idea-list blog posts read (TheGenAI Magazine Oct 5, Parsec AI Labs Oct 15) — assume thousands of participants read the same two posts.

## Crowding by theme

| Theme | Repos / 50 | Blog seeds | Crowding | Verdict |
|---|---|---|---|---|
| Disputes / chargebacks / refunds | 8 | 1 | **Very high** | avoid |
| Buyer-side shopping / checkout agents | 7 | 3 | **Very high** | avoid |
| Agent spending guardrails / fraud / risk | 5 | 1 | High | avoid as *main* idea |
| Escrow / deposits / milestone payments | 4 | 1 | Medium | avoid |
| Freelancer scope-based invoicing | 3 | 1 | Medium | avoid |
| Seller storefronts / sales agents | 3 | 1 | Medium | avoid |
| Budget / personal finance | 2 | 1 | Medium-low | meh |
| Dev tooling / MCP / gateways | 3 | 1 | Low-medium | open |
| B2B / agent-to-agent marketplaces | 2 | 0 | Low | "haggle" already owns A2A negotiation |
| Donations / giving | 2 | 0 | Low | open-ish |
| Verticals (medical bills, voice, creative) | 3 | 1 | Low | open, each unique |
| Subscriptions / churn | 1 | 1 | Low | open |
| Reconciliation / finance ops | 1 | 1 | Low | open |
| **Creator / contributor revenue splitting via Payouts** | 0 | 1 | **Empty** | open |
| **Agent-to-HUMAN commerce (agents hiring people)** | 0 | 0 | **Empty** | open |
| **Savings circles / ROSCA / mutual-aid pools** | 0 | 0 | **Empty** | open |
| **Parametric / event-triggered payouts** | 0 | 0 | **Empty** | open |
| **Monetizing MCP tools / per-call billing on PayPal rails** | ~1 (x402 hybrid) | 0 | **Near-empty** | open |
| x402 / PYUSD / stablecoin | 1 | 0 | Low | not in sandbox; skip |

## Most original competitors seen (benchmark for "novel")

1. **haggle** — two AI agents negotiate, PayPal holds the money.
2. **stood** — evidence-gated release for staged payments.
3. **Offset** — purchase-linked giving at checkout.
4. **amanah** — auditable treasury agent for charities.
5. **plainpay** — medical bills explained by AI, paid via PayPal.
6. **milestone** — Gantt schedules that move with PayPal payments (Bryntum angle).
7. **leash** — spending firewall between agents and PayPal (MCP + AG Grid).

## Blog "10 ideas" (TheGenAI Magazine) and whether taken

1. Gift-finder shopping agent — taken (ShopAgent, buyguy, agentcart, sahaya).
2. Invoice-chasing assistant — partly taken.
3. Subscription churn saver — open.
4. Merchant dispute copilot — heavily taken.
5. Ask-your-payments dashboard (AG Grid) — open-ish.
6. Bookings with deposits — partly taken.
7. Creator revenue splitter (Payouts) — open.
8. Chat-to-pay for small shops — partly taken.
9. Price-watch buying agent (Kernel) — partly taken.
10. PayPal integration copilot (APIMatic/Postman) — mostly open.

## Raw list (50 repos)

| # | Repo | One-liner | Theme |
|---|---|---|---|
| 1 | hacky-man/PayPal_AI_Hackathon-_2026_ | no description | U |
| 2 | DucPhamNgoc08/paypal-ai-hackathon | entry (WIP) | U |
| 3 | satwik1sharma/paypal-ai-hackathon | PayPal developer platform + Claude | DT |
| 4 | MateiS2002/paypal-ai-hackathon-2026 | AI buyer/seller agents negotiate, settle via invoicing | M |
| 5 | DinhJDev/paypal-ai-hackathon-2026 | Salon suite tenant support, churn risk, rent collection | E |
| 6 | LuisRz1/paypal-ai-hackathon-2026 | research vault | U |
| 7 | howdycarter/paypal-ai-hackathon-2026 | agentic commerce on sandbox | S |
| 8 | Awais-Asghar/paypal-ai-hackathon | ideation stage | U |
| 9 | Parithosh-Varma/paypal-ai-hackathon | ShopGenie — AI storefront builder with agentic checkout | SF |
| 10 | Jerryszz02/paypal-ai-hackathon | workspace | U |
| 11 | cloudy070/doorway-paypal-ai-hackathon-2026 | doorway — MCP shopping tools, verified sandbox checkout | DT |
| 12 | vibedatascience/paypal-ai-hackathon-oct-2026 | no description | U |
| 13 | A-Koomson/paypilot | AI revenue recovery agent | SUB |
| 14 | koztechie/paypal-recon-agent | cross-border reconciliation agent | RC |
| 15 | zhangjames01/offset | purchase-linked giving at checkout | G |
| 16 | hengliu63-stack/shopagent | conversational shopping agent | S |
| 17 | Noah-zipit/trustlock | AI escrow for freelancers | E |
| 18 | itzbnny/paypal-budget-agent | conversational banking agent | B |
| 19 | sonevibegrok/sonevibe-paypal-ai-agent | AI sales agent | SF |
| 20 | qinheyi/dispute-steward | AI steward for disputes and invoices | D |
| 21 | CARLEELTECH0/payback-ai | chargeback defense copilot | D |
| 22 | Sarcastic-Soul/milestone | Gantt schedules that move with payments | E |
| 23 | nikolas-sapa/scope-to-deposit-paypal-ai-2026 | scope → deposit | I |
| 24 | ma-za-kpe/stood | evidence-gated release gate | E |
| 25 | dcain2336/payagent-mesh | policy-governed payment rails for agents | R |
| 26 | tokuitao/scope-lock-paypal-ai-2026 | AI scope comparison, reviewed invoices | I |
| 27 | zhoujie0420/payroute | smart payment routing gateway (Go) | DT |
| 28 | jackhu24-ship-it/phantom-grid-titanpay | autonomous clearing engine | R |
| 29 | OmkarD09/Docket | evidence reconciliation for disputes | D |
| 30 | klat58688-ui/refundgpt | AI refund assistant | D |
| 31 | LawrenceMelvin/PaperTales | agentic story & coloring studio | V |
| 32 | HusseinAdeiza/amanah-paypal | auditable treasury agent for charities | G |
| 33 | Jasonsu22/firstreply | dispute prevention agent | D |
| 34 | Ejicode/dispute-autopilot | handles disputes for sellers (Go) | D |
| 35 | annarose14/sahaya | voice-first shopping agent | S |
| 36 | rohith1005H/AgentBaazar | agent-ready commerce for small stores | SF |
| 37 | UnknownHacker1/leash | spending firewall agents↔PayPal (MCP, AG Grid) | R |
| 38 | AryanP3208/plainpay | medical bills explained, paid via PayPal | V |
| 39 | KumarPadigeri/paypal-dispute-copilot | evidence-linked dispute replies | D |
| 40 | Kunleadegbie/voicebridge-pay-hackathon-public | voice accessibility payments | V |
| 41 | mihirargulkar/haggle | two agents haggle; PayPal holds money | M |
| 42 | sahilsaeidkhan/payguard-ai | payment-risk copilot for sellers | R |
| 43 | yz3100400800/agentcart | AI purchasing agent, real sandbox checkouts | S |
| 44 | Akshit-Singh-00/scopepay | scope reviews + sandbox invoices | I |
| 45 | adipatel399/Paypal-Hackathon | Greenlight — conditional checkout, local AI | S |
| 46 | muriithiKabogo/paypal-budget-agent | autonomous budget agent | B |
| 47 | barnabas47/ResolveAI | dispute + zero-carbon return copilot | D |
| 48 | vladimirjoseph36-png/paypal-ai-checkout-agent | natural-language → PayPal orders | S |
| 49 | AR-dev804/paypal-pulse-ai | "payment agent that can't be tricked" | R |
| 50 | its-bzak/buyguy | AI shopping agent | S |
| + | jamesparser/paypal-commerce-mcp | OmegaCommerce: x402 USDC agent↔agent, PayPal to humans, AG Grid provenance | DT/M |

Legend: D disputes, S shopping, R risk, E escrow, I invoicing, SF storefront, B budget, DT dev tooling, M marketplace, G giving, V vertical, SUB subscriptions, RC reconciliation, U unspecified.
