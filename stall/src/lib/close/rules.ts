import type { Payee } from "@/db/schema";
import { daysAgo } from "@/lib/dates";

/**
 * Pure close-of-day rules engine. No DB, no I/O.
 *
 * Decides, for each shift or bill due today, whether the agent may pay it
 * (`pay`), must wait for the owner (`hold`), or must not pay again (`skip`).
 */

export type Obligation = {
  kind: "shift" | "bill";
  id: string;
  payee: Payee;
  amountCents: number;
  note?: string;
  date: string;
};

export type PaidBill = {
  id: string;
  payeeId: string;
  amountCents: number;
  note: string;
  date: string;
  payoutBatchId: string;
};

export type RuleOutcome = {
  obligation: Obligation;
  verdict: "pay" | "hold" | "skip";
  reason: string;
  decisionType?: "over_limit" | "duplicate_bill" | "manual_payee" | "escalated";
  evidence?: { paidBillId: string; payoutBatchId: string };
};

export type EvaluateInput = {
  date: string;
  obligations: Obligation[];
  existingPayouts: { shiftId?: string; billId?: string; status: string }[];
  paidBills: PaidBill[];
  paidTodayByPayee: Record<string, number>;
  businessDailyCapCents: number;
};

/** Formats integer cents as a US dollar string, e.g. 123456 -> "$1,234.56". */
function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${whole}.${String(abs % 100).padStart(2, "0")}`;
}

function normalizeNote(note: string): string {
  return note.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Returns a previously paid bill that makes `bill` a duplicate, or undefined.
 * A match is the same payee, a paid bill dated within the last 7 days
 * (inclusive), and either an amount within 10% of the paid amount or an
 * identical normalized note.
 */
export function findDuplicateBill(
  bill: Obligation,
  paidBills: PaidBill[],
  today: string,
): PaidBill | undefined {
  const windowStart = daysAgo(today, 7);
  const note = normalizeNote(bill.note ?? "");

  return paidBills.find((paid) => {
    if (paid.id === bill.id) return false;
    if (paid.payeeId !== bill.payee.id) return false;
    if (paid.date < windowStart || paid.date > today) return false;
    // |a - p| <= 10% of p, computed in integers to avoid float drift.
    const closeAmount = Math.abs(bill.amountCents - paid.amountCents) * 10 <= paid.amountCents;
    const sameNote = note !== "" && normalizeNote(paid.note) === note;
    return closeAmount || sameNote;
  });
}

/** A shift pays the payee's daily rate; a bill pays its own amount. Null if a shift has no rate. */
function payableAmount(obligation: Obligation): number | null {
  if (obligation.kind === "shift") return obligation.payee.dailyRateCents;
  return obligation.amountCents;
}

/** Mutable per-run state: money paid so far today per payee, and the business total. */
type RunState = { payeeTotals: Record<string, number>; runningPayTotal: number };

function evaluateOne(obligation: Obligation, input: EvaluateInput, state: RunState): RuleOutcome {
  const { payee } = obligation;
  const name = payee.name;
  const outcome = (
    verdict: RuleOutcome["verdict"],
    reason: string,
    extra: Partial<Omit<RuleOutcome, "obligation" | "verdict" | "reason">> = {},
  ): RuleOutcome => ({ obligation, verdict, reason, ...extra });

  const existing = input.existingPayouts.find((p) =>
    obligation.kind === "shift" ? p.shiftId === obligation.id : p.billId === obligation.id,
  );
  if (existing && (existing.status === "PENDING" || existing.status === "SUCCESS")) {
    const what = obligation.kind === "shift" ? "shift" : "bill";
    return outcome(
      "skip",
      `A payout for this ${what} already exists with status ${existing.status}, so it will not be paid again.`,
    );
  }

  if (existing) {
    // FAILED/UNCLAIMED/RETURNED: paying again reuses the same PayPal batch id, so a person must look first.
    return outcome("hold", `previous payout ${existing.status}; check before paying again`, {
      decisionType: "escalated",
    });
  }

  const amountCents = payableAmount(obligation);
  if (amountCents === null) {
    return outcome(
      "hold",
      `Shift logged for ${name}, but no daily rate configured; set one before this can be paid.`,
      { decisionType: "over_limit" },
    );
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return outcome(
      "hold",
      `Held for review: invalid amount (${amountCents} cents) for ${name}.`,
      { decisionType: "over_limit" },
    );
  }

  if (obligation.kind === "bill") {
    const duplicate = findDuplicateBill(obligation, input.paidBills, input.date);
    if (duplicate) {
      return outcome(
        "hold",
        `Possible duplicate: a ${fmt(duplicate.amountCents)} bill for ${name} was already paid on ${duplicate.date}.`,
        {
          decisionType: "duplicate_bill",
          evidence: { paidBillId: duplicate.id, payoutBatchId: duplicate.payoutBatchId },
        },
      );
    }
  }

  if (!payee.enabled) {
    return outcome("hold", `${name} is disabled, so this payment needs your approval.`, {
      decisionType: "manual_payee",
    });
  }
  if (!payee.autoPay) {
    return outcome(
      "hold",
      `${name} is not on auto-pay, so this payment needs your approval.`,
      { decisionType: "manual_payee" },
    );
  }

  const paidSoFar = state.payeeTotals[payee.id] ?? 0;
  const remainingForPayee = payee.maxPerDayCents - paidSoFar;
  if (amountCents > remainingForPayee) {
    return outcome(
      "hold",
      `${fmt(amountCents)} would exceed ${name}'s remaining daily allowance of ${fmt(Math.max(remainingForPayee, 0))} (daily limit ${fmt(payee.maxPerDayCents)}).`,
      { decisionType: "over_limit" },
    );
  }

  if (state.runningPayTotal + amountCents > input.businessDailyCapCents) {
    return outcome(
      "hold",
      `${fmt(amountCents)} would take today's total past the ${fmt(input.businessDailyCapCents)} business daily cap.`,
      { decisionType: "over_limit" },
    );
  }

  const reason =
    obligation.kind === "shift"
      ? `Shift logged today; ${fmt(amountCents)} within ${name}'s daily limit.`
      : `Bill of ${fmt(amountCents)} for ${name} is within the daily limit and auto-pay is on.`;
  return outcome("pay", reason);
}

/**
 * Evaluates obligations in input order. Only `pay` verdicts count toward the
 * running business total checked against `businessDailyCapCents`.
 */
export function evaluateObligations(input: EvaluateInput): RuleOutcome[] {
  const results: RuleOutcome[] = [];
  // Money already paid today counts toward both each payee's limit and the business cap.
  const state: RunState = {
    payeeTotals: { ...input.paidTodayByPayee },
    runningPayTotal: Object.values(input.paidTodayByPayee).reduce((sum, c) => sum + c, 0),
  };

  for (const obligation of input.obligations) {
    const result = evaluateOne(obligation, input, state);
    if (result.verdict === "pay") {
      const amount = payableAmount(obligation) ?? 0;
      state.runningPayTotal += amount;
      state.payeeTotals[obligation.payee.id] =
        (state.payeeTotals[obligation.payee.id] ?? 0) + amount;
    }
    results.push(result);
  }

  return results;
}
