import { generateText, isStepCount, type LanguageModel } from "ai";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { agentRuns } from "@/db/schema";
import { getModel } from "@/lib/ai/model";
import { closeMessages } from "@/lib/i18n/close";
import type { Language } from "@/lib/parse/schema";
import type { createPayout } from "@/lib/paypal/payouts";
import type { InvoiceLookup } from "@/lib/paypal/toolkit";
import {
  buildClosePrompt,
  createCloseTools,
  formatCents,
  holdObligation,
  payObligation,
  record,
  type CloseState,
} from "./agent";
import { loadCloseData } from "./load";
import { evaluateObligations, type RuleOutcome } from "./rules";

export const DEFAULT_BUSINESS_DAILY_CAP_CENTS = 100_000;
const MAX_MODEL_STEPS = 8;

export type RunCloseDeps = {
  model?: LanguageModel;
  createPayout: typeof createPayout;
  businessDailyCapCents?: number;
  now?: Date;
  /** PayPal Agent Toolkit invoice lookup (read-only); omitted in tests and mock mode. */
  invoices?: InvoiceLookup | null;
};

export type RunCloseResult = {
  summary: string;
  paid: { obligationId: string; batchId: string }[];
  held: { decisionId: string }[];
  skipped: number;
  /** Obligations the rules allowed but PayPal did not take; a rerun retries them. */
  failed: { obligationId: string }[];
  /** What the model wrote with write_summary, shown to the owner as "Agent's note". Never the source of facts. */
  agentNote: string | null;
};

/** Built by code from what happened; `language` changes the wording only. */
export function deterministicSummary(
  date: string,
  state: Pick<CloseState, "paid" | "held" | "outcomes">,
  failed: RuleOutcome[],
  skipped: number,
  language: Language = "en",
): string {
  const m = closeMessages(language).summary;
  const label = (o: RuleOutcome, cents: number) => `${o.obligation.payee.name} ${formatCents(cents)}`;
  const parts: string[] = [m.closed(date)];

  const paid = [...state.paid.values()];
  if (paid.length > 0) {
    const total = paid.reduce((sum, p) => sum + p.cents, 0);
    const names = paid.map((p) => label(state.outcomes.get(p.obligationId)!, p.cents)).join(", ");
    parts.push(m.paid(paid.length, formatCents(total), names));
  }
  const heldOutcomes = [...state.held.keys()].map((id) => state.outcomes.get(id)!);
  if (heldOutcomes.length > 0) {
    const names = heldOutcomes
      .map((o) => `${label(o, o.obligation.amountCents)} (${state.held.get(o.obligation.id)!.reason.replace(/[.\s]+$/, "")})`)
      .join("; ");
    parts.push(m.needDecision(heldOutcomes.length, names));
  }
  if (failed.length > 0) {
    const names = failed.map((o) => label(o, o.obligation.amountCents)).join(", ");
    parts.push(m.failed(failed.length, names));
  }
  if (skipped > 0) parts.push(m.skipped(skipped));
  if (parts.length === 1) parts.push(m.nothing);
  return parts.join(" ");
}

/**
 * Closes one business day. The rules engine decides what may be paid; the model
 * may only pay within those verdicts or escalate to a hold, and code finishes
 * whatever the model leaves undone. Running it again for the same date is a no-op.
 */
export async function runClose(
  db: Db,
  deps: RunCloseDeps,
  input: { businessId: string; date: string; language?: Language },
): Promise<RunCloseResult> {
  const { businessId, date } = input;
  // The owner's language: wording of reasons, summary and the agent's note. Never a money rule.
  const language = input.language ?? "en";
  const now = deps.now;
  const data = await loadCloseData(db, businessId, date, now ?? new Date());

  const evaluated = evaluateObligations({
    date,
    obligations: data.obligations,
    existingPayouts: data.existingPayouts,
    paidBills: data.paidBills,
    paidTodayByPayee: data.paidTodayByPayee,
    businessDailyCapCents: deps.businessDailyCapCents ?? DEFAULT_BUSINESS_DAILY_CAP_CENTS,
    language,
  });
  // Anything already escalated belongs to the owner now: never re-decide it, never pay it.
  const alreadyEscalated = closeMessages(language).reasons.alreadyEscalated;
  const outcomes: RuleOutcome[] = evaluated.map((o) =>
    data.decidedIds.has(o.obligation.id) ? { ...o, verdict: "skip", reason: alreadyEscalated } : o,
  );

  const state: CloseState = {
    db,
    businessId,
    date,
    createPayout: deps.createPayout,
    now: () => now ?? new Date(),
    outcomes: new Map(outcomes.map((o) => [o.obligation.id, o])),
    paid: new Map(),
    held: new Map(),
    log: [],
    locks: new Map(),
    invoices: deps.invoices ?? null,
  };

  const actionable = outcomes.filter((o) => o.verdict !== "skip");
  if (actionable.length > 0) {
    try {
      const { text } = await generateText({
        model: deps.model ?? getModel(),
        system: buildClosePrompt({
          date,
          businessName: data.businessName,
          sales: data.sales,
          outcomes,
          language,
          canCheckInvoices: Boolean(deps.invoices),
        }),
        prompt: "Close out the day now.",
        tools: createCloseTools(state),
        stopWhen: isStepCount(MAX_MODEL_STEPS),
      });
      if (text.trim() !== "") record(state, "model_text", null, text.trim());
    } catch (error) {
      // The rules still hold: finish the day in code below.
      record(state, "model_error", null, error instanceof Error ? error.message : String(error));
    }
  }

  // The agent cannot forget: finish whatever it left undone, strictly within the verdicts.
  const failed: RuleOutcome[] = [];
  for (const outcome of actionable) {
    const id = outcome.obligation.id;
    if (state.paid.has(id) || state.held.has(id)) continue;
    if (outcome.verdict === "pay") {
      const result = await payObligation(state, id, outcome.reason);
      record(state, "auto_pay", { obligationId: id }, result);
      if (!result.ok) failed.push(outcome);
    } else {
      const result = await holdObligation(state, id, null);
      record(state, "auto_hold", { obligationId: id }, result);
    }
  }

  const skipped = outcomes.filter((o) => o.verdict === "skip").length;
  const agentNote = state.summary ?? null;
  const result = {
    paid: [...state.paid.values()].map(({ obligationId, batchId }) => ({ obligationId, batchId })),
    held: [...state.held.values()].map(({ decisionId }) => ({ decisionId })),
    skipped,
    failed: failed.map((o) => ({ obligationId: o.obligation.id })),
    agentNote,
  };

  const [existing] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.businessId, businessId), eq(agentRuns.date, date)));

  // Facts come from what actually happened, never from the model's text.
  const summary = deterministicSummary(date, state, failed, skipped, language);
  const acted =
    state.paid.size > 0 ||
    state.held.size > 0 ||
    state.log.some((e) => (e.result as { ok?: boolean } | null)?.ok === false);

  if (existing && !acted) {
    // A rerun that did nothing must not erase the audit trail of the run that did the work.
    return { ...result, summary: existing.summary };
  }

  const priorLog = existing ? existing.log : [];
  const log = [
    ...priorLog,
    ...state.log.map((e) => ({ ...e, step: e.step + priorLog.length })),
  ];
  await db
    .insert(agentRuns)
    .values({ businessId, date, summary, log })
    .onConflictDoUpdate({
      target: [agentRuns.businessId, agentRuns.date],
      set: { summary, log },
    });

  return { ...result, summary };
}
