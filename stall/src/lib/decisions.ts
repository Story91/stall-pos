import { and, eq, inArray, or } from "drizzle-orm";
import type { Db, Decision, Payout } from "@/db";
import { bills, decisions, payees, payouts, shifts } from "@/db/schema";
import { obligationBatchId } from "@/lib/close/batchId";
import { PayPalError } from "@/lib/paypal/client";
import { PayoutDuplicateError, type createPayout } from "@/lib/paypal/payouts";

export type DecisionAction = "approve" | "decline" | "mark_paid";

export type ResolveResult =
  | { ok: true; decision: Decision; payout?: Payout }
  | { ok: false; error: string; debugId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIVE = ["PENDING", "SUCCESS"] as const;

// Serializes work per decision inside this process, so a double tap never reaches PayPal twice.
// Across processes the payout batch id makes PayPal itself reject the repeat.
const locks = new Map<string, Promise<unknown>>();
function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const next = (locks.get(key) ?? Promise.resolve()).then(fn, fn);
  locks.set(key, next);
  const cleanup = () => {
    if (locks.get(key) === next) locks.delete(key);
  };
  next.then(cleanup, cleanup);
  return next;
}

async function livePayout(
  db: Db,
  batchId: string,
  billId: string | null,
  shiftId: string | null,
): Promise<Payout | undefined> {
  const owned = [eq(payouts.batchId, batchId)];
  if (billId) owned.push(eq(payouts.billId, billId));
  if (shiftId) owned.push(eq(payouts.shiftId, shiftId));
  const [row] = await db
    .select()
    .from(payouts)
    .where(and(or(...owned), inArray(payouts.status, [...LIVE])));
  return row;
}

/** Final step: bill and decision change together, and only if the decision is still open. */
async function settle(
  db: Db,
  decisionId: string,
  status: Decision["status"],
  billStatus: "paid" | "declined",
  guardPaid: boolean,
): Promise<ResolveResult> {
  return db.transaction(async (tx): Promise<ResolveResult> => {
    const [decision] = await tx.select().from(decisions).where(eq(decisions.id, decisionId)).for("update");
    if (!decision) return { ok: false, error: "not_found" };
    if (decision.status !== "open") return { ok: false, error: "already_resolved" };
    if (guardPaid) {
      // Never overwrite a bill that money has already moved for.
      const owned = [];
      if (decision.billId) owned.push(eq(payouts.billId, decision.billId));
      if (decision.shiftId) owned.push(eq(payouts.shiftId, decision.shiftId));
      const [paid] =
        owned.length === 0
          ? []
          : await tx
              .select({ id: payouts.id })
              .from(payouts)
              .where(and(or(...owned), inArray(payouts.status, [...LIVE])));
      const [bill] = decision.billId
        ? await tx.select({ status: bills.status }).from(bills).where(eq(bills.id, decision.billId))
        : [];
      if (paid || bill?.status === "paid") return { ok: false, error: "already_paid" };
    }
    if (decision.billId) {
      await tx.update(bills).set({ status: billStatus }).where(eq(bills.id, decision.billId));
    }
    const [updated] = await tx.update(decisions).set({ status }).where(eq(decisions.id, decisionId)).returning();
    return { ok: true, decision: updated! };
  });
}

/**
 * Applies the owner's choice to one open decision. `decline` and `mark_paid`
 * never touch PayPal. `approve` first looks for a live payout already recorded
 * for the obligation (then no PayPal call), else calls PayPal and records the
 * PENDING payout row immediately, before the bill and decision are settled. If
 * settling fails, the row exists and a retry settles without paying again.
 */
export function resolveDecision(
  db: Db,
  deps: { createPayout: typeof createPayout },
  decisionId: string,
  action: DecisionAction,
): Promise<ResolveResult> {
  if (!UUID.test(decisionId)) return Promise.resolve({ ok: false, error: "not_found" });
  return serialize(decisionId, async (): Promise<ResolveResult> => {
    const [decision] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
    if (!decision) return { ok: false, error: "not_found" };
    if (decision.status !== "open") return { ok: false, error: "already_resolved" };

    if (action === "decline") return settle(db, decisionId, "declined", "declined", true);
    if (action === "mark_paid") return settle(db, decisionId, "marked_paid", "paid", true);

    // approve: find what is owed and to whom.
    let kind: "shift" | "bill";
    let obligationId: string;
    let date: string;
    let cents: number | null;
    let email: string;
    if (decision.billId) {
      const [row] = await db
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
      const [row] = await db
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

    const batchId = obligationBatchId(decision.businessId, kind, obligationId);
    const billId = kind === "bill" ? obligationId : null;
    const shiftId = kind === "shift" ? obligationId : null;
    const finish = async (): Promise<ResolveResult> => {
      const settled = await settle(db, decisionId, "approved", "paid", false);
      if (!settled.ok) return settled;
      return { ...settled, payout: await livePayout(db, batchId, billId, shiftId) };
    };

    // Money may already have moved (an earlier approval whose settle step failed, or the agent).
    if (await livePayout(db, batchId, billId, shiftId)) return finish();

    if (cents === null || cents <= 0) return { ok: false, error: "no_amount" };
    let paypalBatchId: string;
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
      if (await livePayout(db, batchId, billId, shiftId)) return finish();
      // PayPal has the batch but we hold no live row for it: the owner must reconcile by hand.
      console.error("payout unrecorded", { batchId });
      return { ok: false, error: "payout_exists_unrecorded" };
    }

    // Record the payout at once, in its own statement, so a later failure cannot lose track of it.
    await db
      .insert(payouts)
      .values({
        businessId: decision.businessId,
        shiftId,
        billId,
        batchId,
        paypalBatchId,
        amountCents: cents,
        status: "PENDING",
        rationale: "Approved by owner",
      })
      .onConflictDoNothing({ target: payouts.batchId });
    return finish();
  });
}
