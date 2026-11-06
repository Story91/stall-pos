import type { Payee } from "@/db/schema";
import { daysAgo } from "@/lib/dates";
import { closeMessages } from "@/lib/i18n/close";
import type { Language } from "@/lib/parse/schema";

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
  /** The earlier paid bill a duplicate matches, so the owner can compare the two side by side. */
  evidence?: {
    paidBillId: string;
    payoutBatchId: string;
    amountCents: number;
    note: string;
    date: string;
  };
};

export type EvaluateInput = {
  date: string;
  obligations: Obligation[];
  existingPayouts: { shiftId?: string; billId?: string; status: string }[];
  paidBills: PaidBill[];
  paidTodayByPayee: Record<string, number>;
  businessDailyCapCents: number;
  /** The owner's language for the reasons only; verdicts never depend on it. Defaults to English. */
  language?: Language;
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
  const r = closeMessages(input.language).reasons;
  const outcome = (
    verdict: RuleOutcome["verdict"],
    reason: string,
    extra: Partial<Omit<RuleOutcome, "obligation" | "verdict" | "reason">> = {},
  ): RuleOutcome => ({ obligation, verdict, reason, ...extra });

  const existing = input.existingPayouts.find((p) =>
    obligation.kind === "shift" ? p.shiftId === obligation.id : p.billId === obligation.id,
  );
  // UNCLAIMED money already left the business (PayPal holds it for the payee), for shifts and bills alike.
  if (existing && (existing.status === "PENDING" || existing.status === "SUCCESS" || existing.status === "UNCLAIMED")) {
    return outcome("skip", r.payoutExists(obligation.kind, existing.status));
  }

  if (existing) {
    // FAILED (PayPal's RETURNED maps to it): paying again reuses the same batch id, so a person must look first.
    return outcome("hold", r.previousPayout(existing.status), {
      decisionType: "escalated",
    });
  }

  const amountCents = payableAmount(obligation);
  if (amountCents === null) {
    return outcome("hold", r.noDailyRate(name), { decisionType: "over_limit" });
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return outcome("hold", r.invalidAmount(amountCents, name), { decisionType: "over_limit" });
  }

  if (obligation.kind === "bill") {
    const duplicate = findDuplicateBill(obligation, input.paidBills, input.date);
    if (duplicate) {
      return outcome("hold", r.duplicate(fmt(duplicate.amountCents), name, duplicate.date), {
        decisionType: "duplicate_bill",
        evidence: {
          paidBillId: duplicate.id,
          payoutBatchId: duplicate.payoutBatchId,
          amountCents: duplicate.amountCents,
          note: duplicate.note,
          date: duplicate.date,
        },
      });
    }
  }

  if (!payee.enabled) {
    return outcome("hold", r.disabled(name), { decisionType: "manual_payee" });
  }
  if (!payee.autoPay) {
    return outcome("hold", r.notAutoPay(name), { decisionType: "manual_payee" });
  }

  const paidSoFar = state.payeeTotals[payee.id] ?? 0;
  const remainingForPayee = payee.maxPerDayCents - paidSoFar;
  if (amountCents > remainingForPayee) {
    return outcome(
      "hold",
      r.overPayeeLimit(
        fmt(amountCents),
        name,
        fmt(Math.max(remainingForPayee, 0)),
        fmt(payee.maxPerDayCents),
      ),
      { decisionType: "over_limit" },
    );
  }

  if (state.runningPayTotal + amountCents > input.businessDailyCapCents) {
    return outcome(
      "hold",
      r.overBusinessCap(fmt(amountCents), fmt(input.businessDailyCapCents)),
      { decisionType: "over_limit" },
    );
  }

  const reason =
    obligation.kind === "shift"
      ? r.shiftOk(fmt(amountCents), name)
      : r.billOk(fmt(amountCents), name);
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
