import { and, eq } from "drizzle-orm";
import type { Db, Decision, Payout } from "@/db";
import { bills, decisions, payees, payouts, shifts } from "@/db/schema";
import { obligationBatchId } from "@/lib/close/agent";
import { PayPalError } from "@/lib/paypal/client";
import { PayoutDuplicateError, type createPayout } from "@/lib/paypal/payouts";

export type DecisionAction = "approve" | "decline" | "mark_paid";

export type ResolveResult =
  | { ok: true; decision: Decision; payout?: Payout }
  | { ok: false; error: string; debugId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies the owner's choice to one open decision. The decision row is locked for
 * the whole transaction, so two taps cannot both pay. For `approve`, PayPal is
 * called first and the payout row, bill and decision change together; if PayPal
 * fails, nothing is written. `decline` and `mark_paid` never touch PayPal.
 */
export async function resolveDecision(
  db: Db,
  deps: { createPayout: typeof createPayout },
  decisionId: string,
  action: DecisionAction,
): Promise<ResolveResult> {
  if (!UUID.test(decisionId)) return { ok: false, error: "not_found" };

  return db.transaction(async (tx): Promise<ResolveResult> => {
    const [decision] = await tx.select().from(decisions).where(eq(decisions.id, decisionId)).for("update");
    if (!decision) return { ok: false, error: "not_found" };
    if (decision.status !== "open") return { ok: false, error: "already_resolved" };

    const settle = async (status: Decision["status"], billStatus?: "paid" | "declined") => {
      if (decision.billId && billStatus) {
        await tx.update(bills).set({ status: billStatus }).where(eq(bills.id, decision.billId));
      }
      const [updated] = await tx
        .update(decisions)
        .set({ status })
        .where(and(eq(decisions.id, decision.id), eq(decisions.status, "open")))
        .returning();
      return updated!;
    };

    if (action === "decline") return { ok: true, decision: await settle("declined", "declined") };
    if (action === "mark_paid") return { ok: true, decision: await settle("marked_paid", "paid") };

    // approve: find what is owed and to whom.
    let kind: "shift" | "bill";
    let obligationId: string;
    let date: string;
    let cents: number | null;
    let email: string;
    if (decision.billId) {
      const [row] = await tx
        .select({ bill: bills, payee: payees })
        .from(bills)
        .innerJoin(payees, eq(bills.payeeId, payees.id))
        .where(eq(bills.id, decision.billId));
      if (!row) return { ok: false, error: "no_obligation" };
      ({ kind, obligationId, date, cents, email } = {
        kind: "bill",
        obligationId: row.bill.id,
        date: row.bill.date,
        cents: row.bill.amountCents,
        email: row.payee.email,
      });
    } else if (decision.shiftId) {
      const [row] = await tx
        .select({ shift: shifts, payee: payees })
        .from(shifts)
        .innerJoin(payees, eq(shifts.payeeId, payees.id))
        .where(eq(shifts.id, decision.shiftId));
      if (!row) return { ok: false, error: "no_obligation" };
      ({ kind, obligationId, date, cents, email } = {
        kind: "shift",
        obligationId: row.shift.id,
        date: row.shift.date,
        cents: row.payee.dailyRateCents,
        email: row.payee.email,
      });
    } else {
      return { ok: false, error: "no_obligation" };
    }
    if (cents === null || cents <= 0) return { ok: false, error: "no_amount" };

    const batchId = obligationBatchId(decision.businessId, kind, obligationId);
    let paypalBatchId: string | null;
    let alreadyRecorded = false;
    try {
      paypalBatchId = (
        await deps.createPayout({ batchId, receiverEmail: email, cents, note: `Stall: ${kind} ${date}` })
      ).paypalBatchId;
    } catch (error) {
      if (!(error instanceof PayoutDuplicateError)) {
        return error instanceof PayPalError && error.debugId
          ? { ok: false, error: "paypal", debugId: error.debugId }
          : { ok: false, error: "paypal" };
      }
      // PayPal already has this batch: it only counts as paid if we hold a live payout row for it.
      const [row] = await tx.select().from(payouts).where(eq(payouts.batchId, batchId));
      if (!row || (row.status !== "PENDING" && row.status !== "SUCCESS")) {
        return { ok: false, error: "payout_exists" };
      }
      paypalBatchId = row.paypalBatchId;
      alreadyRecorded = true;
    }

    if (!alreadyRecorded) {
      await tx
        .insert(payouts)
        .values({
          businessId: decision.businessId,
          shiftId: kind === "shift" ? obligationId : null,
          billId: kind === "bill" ? obligationId : null,
          batchId,
          paypalBatchId,
          amountCents: cents,
          status: "PENDING",
          rationale: "Approved by owner",
        })
        .onConflictDoNothing({ target: payouts.batchId });
    }
    const [payout] = await tx.select().from(payouts).where(eq(payouts.batchId, batchId));
    return { ok: true, decision: await settle("approved", "paid"), payout };
  });
}
